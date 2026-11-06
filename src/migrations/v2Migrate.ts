/**
 * V2 data migration. Idempotent: safe to run more than once.
 *
 *   npm run migrate:v2 -- --dry-run                 report what would change, write nothing
 *   npm run migrate:v2                              apply
 *   npm run migrate:v2 -- --fallback-surveyor <id>  surveyor for old jobs that have no assigned surveyor
 *
 * Steps
 *  1. Creates the UQMS counter if it is missing (continues after the highest existing number).
 *  2. Applies src/migrations/surveyTypeMapping.json (survey type code → main type / sector), if present.
 *  3. Creates a legacy Job for every pre-V2 First Entry, linking its booking and survey report and
 *     deriving the status (signed certificate → completed, report → in-progress, booking → booked).
 *  4. Reports requests with an accepted quotation and no First Entry (they appear in Surveyor Allocation).
 *
 * Back up the database first, and check MONGODB_URI points at the database you mean to change.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { runAsSystem } from '../middleware/requestContext';
import { ensureUqmsCounter } from '../services/uqmsNumberService';
import DocumentNumber from '../models/DocumentNumber';
import SurveyType, { migrateSurveyTypeMainTypes } from '../models/SurveyType';
import FirstEntry from '../models/FirstEntry';
import RequestModel from '../models/Request';
import Quotation from '../models/Quotation';
import Job, { JobStatus } from '../models/Job';
import FirstEntrySurveyBooking from '../models/FirstEntrySurveyBooking';
import FirstEntrySurveyReport from '../models/FirstEntrySurveyReport';
import SCCCOS from '../models/SCCCOS';
import Vessel from '../models/Vessel';
import { isMainSurveyType } from '../config/surveyCategories';

dotenv.config();

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const fallbackIdx = args.indexOf('--fallback-surveyor');
const FALLBACK_SURVEYOR = fallbackIdx >= 0 ? args[fallbackIdx + 1] : undefined;
const MAPPING_FILE = path.join(__dirname, 'surveyTypeMapping.json');

const report = {
  uqmsCounter: '',
  mappingApplied: 0,
  mappingUnknownCodes: [] as string[],
  surveyTypesUnmapped: [] as string[],
  jobsCreated: 0,
  jobsExisting: 0,
  jobsByStatus: {} as Record<string, number>,
  skippedNoSurveyor: [] as string[],
  skippedNoRequest: [] as string[],
  sharedBookings: [] as string[],
  requestsAwaitingAllocation: 0,
};

const log = (msg: string) => console.log(`${DRY ? '[dry-run] ' : ''}${msg}`);

const stepCounter = async () => {
  const existing = await DocumentNumber.findOne({ name: 'UQMS' }).lean();
  if (existing) {
    report.uqmsCounter = `exists (${existing.prefix}, last ${existing.lastNumber})`;
    return;
  }
  report.uqmsCounter = DRY ? 'missing — would be created' : 'created';
  if (!DRY) await ensureUqmsCounter();
};

const stepMapping = async () => {
  if (!DRY) await migrateSurveyTypeMainTypes();
  if (fs.existsSync(MAPPING_FILE)) {
    const mapping: Record<string, { mainTypes?: string[]; mainType?: string | null; sector?: string }> = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    for (const [code, entry] of Object.entries(mapping)) {
      if (code.startsWith('_')) continue; // comments
      const type = await SurveyType.findOne({ code });
      if (!type) {
        report.mappingUnknownCodes.push(code);
        continue;
      }
      // `mainTypes` (a sub type can sit under several main types); a single legacy `mainType` still works.
      const mainTypes = entry.mainTypes ?? (entry.mainType ? [entry.mainType] : []);
      const bad = mainTypes.find((m) => !isMainSurveyType(m));
      if (bad) {
        report.mappingUnknownCodes.push(`${code} (bad main type "${bad}")`);
        continue;
      }
      if (!DRY) {
        await SurveyType.updateOne(
          { _id: type._id },
          { $set: { mainTypes: [...new Set(mainTypes)], ...(entry.sector ? { sector: entry.sector } : {}) } }
        );
      }
      report.mappingApplied += 1;
    }
  } else {
    log(`No mapping file at ${MAPPING_FILE}; survey types left unmapped.`);
  }
  const unmapped = await SurveyType.find({ $or: [{ mainTypes: { $size: 0 } }, { mainTypes: { $exists: false } }] }).select('code name').lean();
  report.surveyTypesUnmapped = unmapped.map((t) => `${t.code} ${t.name}`);
};

const deriveStatus = async (bookingId?: unknown, surveyReportId?: unknown): Promise<JobStatus> => {
  if (surveyReportId) {
    const cos = await SCCCOS.findOne({ surveyReportId }).select('eSignature').lean();
    if ((cos as any)?.eSignature?.signedAt) return 'completed';
    return 'in-progress';
  }
  return bookingId ? 'booked' : 'allocated';
};

const stepJobs = async () => {
  const entries = await FirstEntry.find().sort({ createdAt: 1 }).lean();
  const bookingUse = new Map<string, string[]>();

  for (const fe of entries) {
    if (await Job.exists({ request: fe.request })) {
      report.jobsExisting += 1;
      continue;
    }
    const request = await RequestModel.findById(fe.request).lean();
    if (!request) {
      report.skippedNoRequest.push(String(fe._id));
      continue;
    }
    const vessel = await Vessel.findById(fe.vessel).select('vesselName vesselCode uqmsNumber').lean();
    const booking = await FirstEntrySurveyBooking.findOne({ requestIds: request._id }).sort({ createdAt: 1 }).lean();
    const surveyReport = booking ? await FirstEntrySurveyReport.findOne({ bookingId: booking._id }).select('_id').lean() : null;

    if (booking) {
      const key = String(booking._id);
      bookingUse.set(key, [...(bookingUse.get(key) || []), request.requestNumber]);
    }

    const assigned = (booking?.visitDetails || [])
      .flatMap((v: any) => v.surveyorAssignments || [])
      .map((a: any) => a?.surveyorId)
      .filter(Boolean)
      .map(String);
    const surveyor = assigned[0] || FALLBACK_SURVEYOR;
    if (!surveyor) {
      report.skippedNoSurveyor.push(request.requestNumber);
      continue;
    }

    const status = await deriveStatus(booking?._id, surveyReport?._id);
    const quotation = await Quotation.findOne({ request: request._id, status: 'accepted' }).select('_id quotationNumber').lean();
    report.jobsByStatus[status] = (report.jobsByStatus[status] || 0) + 1;
    report.jobsCreated += 1;
    if (DRY) continue;

    await Job.create({
      request: request._id,
      requestNumber: request.requestNumber,
      jobNumber: request.jobNumber,
      quotation: quotation?._id,
      quotationNumber: quotation?.quotationNumber ?? fe.quotationNumber,
      vessel: fe.vessel,
      vesselName: vessel?.vesselName ?? request.vesselName,
      vesselCode: vessel?.vesselCode ?? request.vesselCode,
      uqmsNumber: vessel?.uqmsNumber ?? request.uqmsNumber,
      sector: request.sector ?? 'marine',
      mainSurveyType: 'first-entry',
      surveyTypes: request.surveyTypes ?? [],
      surveyor,
      assistantSurveyors: [...new Set(assigned.slice(1))].filter((id) => id !== surveyor),
      mssProofRequired: false,
      firstEntry: fe._id,
      booking: booking?._id,
      surveyReport: surveyReport?._id,
      status,
      statusHistory: [{ from: null, to: status, at: new Date(), byName: 'System', reason: 'Migrated from the pre-V2 workflow.' }],
      allocatedAt: fe.createdAt,
      completedAt: status === 'completed' ? new Date() : undefined,
      legacy: true,
    });

    if (vessel?.uqmsNumber && !request.uqmsNumber) {
      await RequestModel.updateOne({ _id: request._id }, { $set: { uqmsNumber: vessel.uqmsNumber } });
    }
  }

  for (const [bookingId, requests] of bookingUse) {
    if (requests.length > 1) report.sharedBookings.push(`${bookingId}: ${requests.join(', ')}`);
  }

  const accepted = await Quotation.find({ status: 'accepted' }).distinct('request');
  const withEntry = new Set((await FirstEntry.find({ request: { $in: accepted } }).distinct('request')).map(String));
  const withJob = new Set((await Job.find({ request: { $in: accepted } }).distinct('request')).map(String));
  report.requestsAwaitingAllocation = accepted.map(String).filter((id) => !withEntry.has(id) && !withJob.has(id)).length;
};

const run = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipping';
  await mongoose.connect(uri);
  log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

  await runAsSystem('v2-migration', async () => {
    await stepCounter();
    await stepMapping();
    await stepJobs();
  });

  console.log('\n──── V2 migration report ────');
  console.log(JSON.stringify(report, null, 2));
  if (report.sharedBookings.length) {
    console.log('\nNote: these bookings cover more than one request. Each job links the same booking, so their reporting is shared.');
  }
  if (report.skippedNoSurveyor.length) {
    console.log('\nNote: some first entries had no assigned surveyor. Re-run with --fallback-surveyor <userId> to include them.');
  }
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
