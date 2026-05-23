const IST_TIME_ZONE = 'Asia/Kolkata';

const ddMmYyyyFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: IST_TIME_ZONE,
});

const keyDatePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: IST_TIME_ZONE,
});

export const formatDate = (value: Date = new Date()): string => ddMmYyyyFormatter.format(value);

export const getIstDateParts = (value: Date = new Date()) => {
  const parts = keyDatePartsFormatter.formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    day: byType.get('day') || '01',
    month: byType.get('month') || '01',
    year: byType.get('year') || '1970',
  };
};

