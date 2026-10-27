/**
 * V2: the Certificate of Survey (COS) takes its name, title and governing code from the vessel code.
 * SSC vessels get the Small Craft Code COS (SSCCOS). Codes without their own entry get a generic COS
 * named after the code until their wording is supplied.
 */
export interface CosVariant {
  /** Short name shown in the portal, e.g. "SSCCOS". */
  shortName: string;
  /** Title printed on the certificate. */
  title: string;
  /** Default "type of survey" line. */
  defaultTypeOfSurvey: string;
  /** Certification statement printed above the signature. */
  certificationText: string;
}

const VARIANTS: Record<string, CosVariant> = {
  SSC: {
    shortName: 'SSCCOS',
    title: 'SMALL CRAFT CODE CERTIFICATE OF SURVEY',
    defaultTypeOfSurvey: 'SSC Initial Survey',
    certificationText:
      'I hereby certify that the inspection was carried out in accordance with the guidelines provided under the Small Craft Code 2025, and the vessel was found to comply with the relevant safety and equipment standards at the time of examination.',
  },
};

const GENERIC_TEXT =
  'I hereby certify that the inspection was carried out in accordance with the applicable rules and guidelines, and the vessel was found to comply with the relevant safety and equipment standards at the time of examination.';

/** Schedule II is named after the vessel's governing code, e.g. "SSC Schedule II". */
export const scheduleIILabelFor = (vesselCode?: string | null): string => {
  const code = String(vesselCode || '').trim().toUpperCase();
  return code ? `${code} Schedule II` : 'Schedule II';
};

export const cosVariantFor = (vesselCode?: string | null): CosVariant => {
  const code = String(vesselCode || '').trim().toUpperCase();
  if (VARIANTS[code]) return VARIANTS[code];
  return {
    shortName: code ? `${code}COS` : 'COS',
    title: 'CERTIFICATE OF SURVEY',
    defaultTypeOfSurvey: code ? `${code} Initial Survey` : 'Initial Survey',
    certificationText: GENERIC_TEXT,
  };
};
