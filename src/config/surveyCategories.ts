/**
 * V2 survey classification. Every survey type (ST01, ST02 ...) is a *sub type* that belongs to one
 * main survey type. The main type is chosen at Surveyor Allocation and decides which reporting
 * workspace the job uses. Mirrored in the frontend at `src/config/surveyCategories.ts`.
 */

export const SECTORS = ['marine', 'industrial'] as const;
export type Sector = (typeof SECTORS)[number];

export const MARINE_MAIN_TYPES = ['first-entry', 'periodical', 'occasional', 'new-construction', 'audit'] as const;
export const INDUSTRIAL_MAIN_TYPES = ['industrial-audit', 'industrial-survey'] as const;
export const MAIN_SURVEY_TYPES = [...MARINE_MAIN_TYPES, ...INDUSTRIAL_MAIN_TYPES] as const;
export type MainSurveyType = (typeof MAIN_SURVEY_TYPES)[number];

export const MAIN_SURVEY_TYPE_LABELS: Record<MainSurveyType, string> = {
  'first-entry': 'First Entry',
  periodical: 'Periodical Survey',
  occasional: 'Occasional Survey',
  'new-construction': 'New Constructions',
  audit: 'Audits',
  'industrial-audit': 'Audits',
  'industrial-survey': 'Surveys',
};

export const sectorOfMainType = (mainType: MainSurveyType): Sector =>
  (INDUSTRIAL_MAIN_TYPES as readonly string[]).includes(mainType) ? 'industrial' : 'marine';

export const isMainSurveyType = (value: unknown): value is MainSurveyType =>
  typeof value === 'string' && (MAIN_SURVEY_TYPES as readonly string[]).includes(value);

/** Main types whose reporting workspace is built in this version. */
export const IMPLEMENTED_MAIN_TYPES: MainSurveyType[] = ['first-entry'];

/** Fixed V2 roles (by role name) whose users can be allocated to jobs. */
export const SURVEYOR_ROLE_NAME = 'surveyor';
export const ASSISTANT_SURVEYOR_ROLE_NAME = 'assistant-surveyor';
export const SURVEYOR_ROLE_NAMES = [SURVEYOR_ROLE_NAME, ASSISTANT_SURVEYOR_ROLE_NAME];
