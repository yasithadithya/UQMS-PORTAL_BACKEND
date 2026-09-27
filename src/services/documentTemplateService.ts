import DocumentTemplate from '../models/DocumentTemplate';

/** Names of the controlled documents printed by the PDF services; each is the documentName key in the DB. */
export const DOCUMENT_TEMPLATE_NAMES = {
  requestForSurvey: 'Request for Survey',
  dockingStatement: 'Docking Statement',
  surveyReport: 'Record of Equipment & Survey Report',
  scccos: 'Small Craft Code Certificate of Survey',
  quotation: 'Quotation',
} as const;

export type DocumentTemplateName = (typeof DOCUMENT_TEMPLATE_NAMES)[keyof typeof DOCUMENT_TEMPLATE_NAMES];

type DocumentTemplateData = {
  documentName: DocumentTemplateName;
  documentNumber: string;
  revision: string;
  effectiveDate: Date;
  approvedBy: string;
};

/**
 * Seed values, also used as the fallback when a template is missing from the DB
 * so a PDF never renders without its controlled document details.
 */
export const DEFAULT_DOCUMENT_TEMPLATES: DocumentTemplateData[] = [
  {
    documentName: DOCUMENT_TEMPLATE_NAMES.requestForSurvey,
    documentNumber: 'UQMS-FM-009',
    revision: '00',
    effectiveDate: new Date('2026-01-25'),
    approvedBy: 'Technical Committee',
  },
  {
    documentName: DOCUMENT_TEMPLATE_NAMES.dockingStatement,
    documentNumber: 'UQMS-FM-017',
    revision: '00',
    effectiveDate: new Date('2026-01-25'),
    approvedBy: 'Technical Committee',
  },
  {
    documentName: DOCUMENT_TEMPLATE_NAMES.surveyReport,
    documentNumber: 'UQMS-FM-018',
    revision: '00',
    effectiveDate: new Date('2026-01-25'),
    approvedBy: 'Technical Committee',
  },
  {
    documentName: DOCUMENT_TEMPLATE_NAMES.scccos,
    documentNumber: 'UQMS-FM-019',
    revision: '00',
    effectiveDate: new Date('2026-01-25'),
    approvedBy: 'Technical Committee',
  },
  {
    documentName: DOCUMENT_TEMPLATE_NAMES.quotation,
    documentNumber: 'UQMS-FM-020',
    revision: '00',
    effectiveDate: new Date('2026-01-25'),
    approvedBy: 'Technical Committee',
  },
];

export type DocumentTemplateDetails = Omit<DocumentTemplateData, 'documentName'>;

/** Loads a controlled document's details, falling back to the defaults when the DB has no record. */
export const getDocumentTemplate = async (documentName: DocumentTemplateName): Promise<DocumentTemplateDetails> => {
  try {
    const template = await DocumentTemplate.findOne({ documentName })
      .select('documentNumber revision effectiveDate approvedBy')
      .lean<DocumentTemplateDetails>();
    if (template) return template;
  } catch (error) {
    console.error(`Failed to load document template "${documentName}":`, error);
  }

  const { documentName: _name, ...fallback } = DEFAULT_DOCUMENT_TEMPLATES.find((item) => item.documentName === documentName)!;
  return fallback;
};
