import { Request } from 'express';
import { Model } from 'mongoose';
import SurveyReportModel from '../models/SurveyReport';
import DockingSurveyCertModel from '../models/DockingSurveyCert';
import SCCCOSModel from '../models/SCCCOS';
import FirstEntryFullReport from '../models/FirstEntryFullReport';
import FirstEntrySurveyReportModel from '../models/FirstEntrySurveyReport';
import FirstEntrySurveyBookingModel from '../models/FirstEntrySurveyBooking';
import { ISignatureField } from '../models/ESignature';
import { renderAndStoreSurveyReportPdf } from '../controllers/surveyReportController';
import { renderAndStoreDockingSurveyPdf } from '../controllers/dockingSurveyCertController';
import { renderAndStoreScccosPdf } from '../controllers/scccosController';
import { renderAndStoreDailyReportPdf } from '../controllers/firstEntryFullReportController';

/**
 * Documents that carry an electronic signature field, and how to find their booking
 * (which decides who may sign), default signing location and stored PDF.
 */
export type SignableDocType = 'survey-report' | 'docking-cert' | 'scccos' | 'daily-report';

type BookingLike = {
  portOfSurvey?: string;
  visitDetails?: {
    visitDate?: Date;
    location?: string;
    surveyorAssignments?: { surveyorId?: unknown }[];
  }[];
};

export interface SignableDocumentHandler {
  label: string;
  model: Model<any>;
  /** The booking whose assigned surveyors may sign the document. */
  loadBooking(doc: any): Promise<BookingLike | null>;
  /** Location printed on the stamp unless the signer changes it. */
  defaultLocation(doc: any, booking: BookingLike | null, userId: string): Promise<string>;
  /** Why the document cannot be signed yet, or null when it can. */
  notSignableReason(doc: any): string | null;
  signatureField(doc: any): ISignatureField | undefined;
  hasStoredPdf(doc: any): boolean;
  /** Whether the PDF can be rendered at any time (the daily report is only rendered on request). */
  rendersPdfOnDemand: boolean;
  /** Re-renders and stores the PDF so it reflects the document's current signature state. */
  regeneratePdf(req: Request, id: string): Promise<void>;
}

const idOf = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'object' && '_id' in (value as any)) return String((value as any)._id);
  return String(value);
};

const loadBookingById = async (bookingId: unknown): Promise<BookingLike | null> => {
  const id = idOf(bookingId);
  if (!id) return null;
  return FirstEntrySurveyBookingModel.findById(id).select('portOfSurvey visitDetails').lean<BookingLike>();
};

export const isAssignedSurveyor = (booking: BookingLike | null, userId: string): boolean =>
  Boolean(
    booking?.visitDetails?.some((visit) =>
      visit.surveyorAssignments?.some((assignment) => idOf(assignment.surveyorId) === userId)
    )
  );

/** Assigned surveyors in order of their most recent visit, without duplicates. */
export const assignedSurveyorIds = (booking: BookingLike | null): string[] => {
  const visits = [...(booking?.visitDetails || [])].sort(
    (a, b) => new Date(b.visitDate || 0).getTime() - new Date(a.visitDate || 0).getTime()
  );
  const ids = visits.flatMap((visit) => (visit.surveyorAssignments || []).map((assignment) => idOf(assignment.surveyorId)));
  return [...new Set(ids.filter(Boolean))];
};

/** Location of the signer's most recent visit, falling back to the booking's port of survey. */
const bookingLocation = (booking: BookingLike | null, userId: string): string => {
  const visits = (booking?.visitDetails || [])
    .filter((visit) => visit.location?.trim())
    .sort((a, b) => new Date(b.visitDate || 0).getTime() - new Date(a.visitDate || 0).getTime());
  const ownVisit = visits.find((visit) =>
    visit.surveyorAssignments?.some((assignment) => idOf(assignment.surveyorId) === userId)
  );
  return (ownVisit?.location || booking?.portOfSurvey || visits[0]?.location || '').trim();
};

const signableDocuments: Record<SignableDocType, SignableDocumentHandler> = {
  'survey-report': {
    label: 'Survey Report',
    model: SurveyReportModel,
    async loadBooking(doc) {
      const firstEntry = await FirstEntrySurveyReportModel.findById(idOf(doc.firstEntrySurveyReportId)).select('bookingId');
      return loadBookingById(firstEntry?.bookingId);
    },
    async defaultLocation(doc, booking, userId) {
      const firstEntry = await FirstEntrySurveyReportModel.findById(idOf(doc.firstEntrySurveyReportId)).select('portOfSurvey');
      return (firstEntry?.portOfSurvey || '').trim() || bookingLocation(booking, userId);
    },
    notSignableReason: (doc) =>
      doc.status === 'Approved' ? null : 'The Survey Report must be approved before it can be signed.',
    signatureField: (doc) => doc.pdf?.signatureField,
    hasStoredPdf: (doc) => Boolean(doc.pdf?.key),
    rendersPdfOnDemand: true,
    async regeneratePdf(req, id) {
      await renderAndStoreSurveyReportPdf(req, id);
    },
  },
  'docking-cert': {
    label: 'Docking Survey Certificate',
    model: DockingSurveyCertModel,
    loadBooking: (doc) => loadBookingById(doc.surveyBookingId),
    async defaultLocation(doc, booking, userId) {
      return (doc.surveyLocation || '').trim() || bookingLocation(booking, userId);
    },
    notSignableReason: () => null,
    signatureField: (doc) => doc.pdf?.signatureField,
    hasStoredPdf: (doc) => Boolean(doc.pdf?.key),
    rendersPdfOnDemand: true,
    async regeneratePdf(req, id) {
      await renderAndStoreDockingSurveyPdf(req, id);
    },
  },
  scccos: {
    label: 'SCCCOS Certificate',
    model: SCCCOSModel,
    loadBooking: (doc) => loadBookingById(doc.surveyBookingId),
    async defaultLocation(_doc, booking, userId) {
      return bookingLocation(booking, userId);
    },
    notSignableReason: () => null,
    signatureField: (doc) => doc.pdf?.signatureField,
    hasStoredPdf: (doc) => Boolean(doc.pdf?.key),
    rendersPdfOnDemand: true,
    async regeneratePdf(req, id) {
      await renderAndStoreScccosPdf(req, id);
    },
  },
  'daily-report': {
    label: 'Daily Visit Report',
    model: FirstEntryFullReport,
    loadBooking: (doc) => loadBookingById(doc.bookingId),
    async defaultLocation(_doc, booking, userId) {
      return bookingLocation(booking, userId);
    },
    notSignableReason: (doc) =>
      doc.dailyReportPdfKey ? null : 'Generate the Daily Visit Report before signing it.',
    signatureField: (doc) => doc.dailyReportSignatureField,
    hasStoredPdf: (doc) => Boolean(doc.dailyReportPdfKey),
    rendersPdfOnDemand: false,
    async regeneratePdf(req, id) {
      const report = await FirstEntryFullReport.findById(id)
        .populate('firstEntrySurveyReportId')
        .populate('bookingId')
        .populate('vesselId')
        .populate('checklist.checklistQuestionId');
      if (!report) return;
      await renderAndStoreDailyReportPdf(req, report);
      await report.save();
    },
  },
};

export const getSignableDocument = (docType: string): SignableDocumentHandler | null =>
  Object.prototype.hasOwnProperty.call(signableDocuments, docType)
    ? signableDocuments[docType as SignableDocType]
    : null;
