/** Philippine peso formatting — the design uses ₱ throughout. */
const currency = (value, decimals = 2) =>
  `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const currencyCompact = (value) =>
  `₱${Math.round(Number(value) || 0).toLocaleString('en-PH')}`;

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || '?';

const percent = (value, total) => {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total)) * 100);
};

/** Start-of-day / end-of-day for a given date, in local time. */
const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const daysAgo = (n) => startOfDay(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

/** Escapes a value for safe CSV export (prevents formula injection). */
const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const toCsv = (rows) =>
  rows.map((row) => row.map(csvCell).join(',')).join('\n');

/** Parses `?page=&limit=` with sane bounds. */
const parsePaging = (query, { defaultLimit = 20, maxLimit = 200 } = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit),
  );
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = {
  currency,
  currencyCompact,
  round2,
  initials,
  percent,
  startOfDay,
  endOfDay,
  daysAgo,
  csvCell,
  toCsv,
  parsePaging,
};
