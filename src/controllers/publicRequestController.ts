import { Request, Response } from 'express';
import RequestModel from '../models/Request';
import VesselType from '../models/VesselType';
import AreaOfOperation from '../models/AreaOfOperation';
import SurveyType from '../models/SurveyType';
import { allocateRequestNumbers } from '../services/requestNumberService';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const toTrimmedString = (value: string): string => value.trim();

/** Lookup key used to match website-supplied names against seeded reference data. */
const normalizeKey = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Builds a lookup map from the given fields of a reference collection.
 * Earlier fields win, so the primary field takes precedence over the fallback.
 */
const buildLookup = <T extends Record<string, any>>(rows: T[], fields: string[]): Map<string, T> => {
  const map = new Map<string, T>();
  for (const field of fields) {
    for (const row of rows) {
      const raw = row[field];
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const key = normalizeKey(raw);
      if (!map.has(key)) map.set(key, row);
    }
  }
  return map;
};

/**
 * POST /api/public/survey-requests
 *
 * Creates a Request from the public website's Request-a-Survey form.
 *
 * The website sends human-readable names ("Cargo Vessels", "Annual survey")
 * rather than ObjectIds, because it has no authenticated access to the
 * /api/operations lookups. Those names are resolved against the seeded
 * reference collections here.
 *
 * Marine only for now: the portal does not yet model industrial-sector work.
 */
export const createPublicSurveyRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      sector,
      vesselName,
      companyName,
      contactPersonName,
      contactPersonNumber,
      companyEmail,
      registerdAddress,
      invoicingAddress,
      vesselType,
      areaOfOperation,
      surveyTypes,
    } = req.body ?? {};

    // Anything the caller may not set: createdAt, status, requestNumber,
    // rfsDocNo, source and createdBy are deliberately ignored.

    if (!isNonEmptyString(sector)) {
      res.status(400).json({ success: false, message: 'Sector is required.' });
      return;
    }

    const normalizedSector = sector.trim().toLowerCase();
    if (normalizedSector !== 'marine') {
      res.status(400).json({
        success: false,
        message: 'Only marine sector requests can be submitted through the public form at this time.',
      });
      return;
    }

    const requiredFields: Array<[string, unknown]> = [
      ['Vessel name', vesselName],
      ['Company name', companyName],
      ['Contact person name', contactPersonName],
      ['Contact person number', contactPersonNumber],
      ['Company email', companyEmail],
      ['Invoicing address', invoicingAddress],
      ['Vessel type', vesselType],
      ['Area of operation', areaOfOperation],
    ];

    for (const [label, value] of requiredFields) {
      if (!isNonEmptyString(value)) {
        res.status(400).json({ success: false, message: `${label} is required.` });
        return;
      }
    }

    if (!Array.isArray(surveyTypes) || surveyTypes.length === 0) {
      res.status(400).json({ success: false, message: 'At least one survey type is required.' });
      return;
    }

    const requestedSurveyNames = surveyTypes.filter(isNonEmptyString).map(toTrimmedString);
    if (requestedSurveyNames.length === 0) {
      res.status(400).json({ success: false, message: 'At least one survey type is required.' });
      return;
    }

    // Reference collections are small (6 / 11 / 28 rows), so load and match in
    // memory rather than building case-insensitive queries per value.
    const [vesselTypeRows, areaRows, surveyTypeRows] = await Promise.all([
      VesselType.find().lean(),
      AreaOfOperation.find().lean(),
      SurveyType.find().lean(),
    ]);

    const vesselTypeDoc = buildLookup(vesselTypeRows, ['name', 'group']).get(
      normalizeKey(vesselType as string)
    );
    if (!vesselTypeDoc) {
      res.status(400).json({
        success: false,
        message: `Vessel type "${toTrimmedString(vesselType as string)}" was not recognised.`,
      });
      return;
    }

    const areaDoc = buildLookup(areaRows, ['description', 'AreaCategory']).get(
      normalizeKey(areaOfOperation as string)
    );
    if (!areaDoc) {
      res.status(400).json({
        success: false,
        message: `Area of operation "${toTrimmedString(areaOfOperation as string)}" was not recognised.`,
      });
      return;
    }

    const surveyLookup = buildLookup(surveyTypeRows, ['name', 'code']);
    const resolvedSurveyIds: string[] = [];
    const unknownSurveys: string[] = [];

    for (const name of requestedSurveyNames) {
      const match = surveyLookup.get(normalizeKey(name));
      if (match) {
        resolvedSurveyIds.push(String(match._id));
      } else {
        unknownSurveys.push(name);
      }
    }

    if (unknownSurveys.length > 0) {
      res.status(400).json({
        success: false,
        message: `The following survey types were not recognised: ${unknownSurveys.join(', ')}.`,
      });
      return;
    }

    const uniqueSurveyIds = Array.from(new Set(resolvedSurveyIds));

    const { requestNumber, rfsDocNo } = await allocateRequestNumbers();

    const newRequest = new RequestModel({
      requestNumber,
      rfsDocNo,
      vesselName: toTrimmedString(vesselName as string),
      companyName: toTrimmedString(companyName as string),
      contactPersonName: toTrimmedString(contactPersonName as string),
      contactPersonNumber: toTrimmedString(contactPersonNumber as string),
      companyEmail: toTrimmedString(companyEmail as string),
      registerdAddress: isNonEmptyString(registerdAddress)
        ? toTrimmedString(registerdAddress)
        : undefined,
      invoicingAddress: toTrimmedString(invoicingAddress as string),
      sector: 'marine',
      vesselType: vesselTypeDoc._id,
      areaOfOperation: areaDoc._id,
      surveyTypes: uniqueSurveyIds,
      status: 'active',
      source: 'web',
    });

    await newRequest.save();

    res.status(201).json({
      success: true,
      message: 'Request created successfully.',
      data: {
        _id: newRequest._id,
        requestNumber: newRequest.requestNumber,
        rfsDocNo: newRequest.rfsDocNo,
      },
    });
  } catch (error: any) {
    // Never surface internal error text to a public caller.
    console.error('[publicRequestController] Failed to create public survey request:', error);

    if (error?.code === 11000) {
      res.status(409).json({ success: false, message: 'Request number already exists.' });
      return;
    }

    res.status(500).json({ success: false, message: 'Error creating request.' });
  }
};
