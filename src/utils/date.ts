/**
 * Project Date Formatting Standard: yyyy/mm/dd (24-hour clock)
 * All displayed/reported dates in the backend must be formatted consistently in yyyy/mm/dd format.
 * Developers should utilize formatting helpers defined in this file.
 */

const IST_TIME_ZONE = 'Asia/Kolkata';

// Intl has no locale that reliably yields yyyy/mm/dd, so the parts are assembled by hand.
const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: IST_TIME_ZONE,
});

const keyDatePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: IST_TIME_ZONE,
});

type DateParts = { year: string; month: string; day: string; hour: string; minute: string };

const toParts = (value?: Date | string | null): DateParts | null => {
  if (!value) return null;

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return null;

  const byType = new Map(partsFormatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: byType.get('year') || '1970',
    month: byType.get('month') || '01',
    day: byType.get('day') || '01',
    // Some runtimes emit hour "24" for midnight when hour12 is false.
    hour: (byType.get('hour') || '00') === '24' ? '00' : byType.get('hour') || '00',
    minute: byType.get('minute') || '00',
  };
};

export const formatDate = (value: Date | string | null = new Date()): string => {
  const parts = toParts(value);

  return parts ? `${parts.year}/${parts.month}/${parts.day}` : '-';
};

export const formatDateTime = (value: Date | string | null = new Date()): string => {
  const parts = toParts(value);

  return parts ? `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}` : '-';
};

export const formatTime = (value: Date | string | null = new Date()): string => {
  const parts = toParts(value);

  return parts ? `${parts.hour}:${parts.minute}` : '-';
};

export const getIstDateParts = (value: Date = new Date()) => {
  const parts = keyDatePartsFormatter.formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    day: byType.get('day') || '01',
    month: byType.get('month') || '01',
    year: byType.get('year') || '1970',
  };
};
