/** Display helpers. Mirrors server/src/utils/helpers.js. */

export const peso = (value, decimals = 2) =>
  `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

/** Compact peso for KPI tiles: ₱14,850 (no decimals). */
export const pesoShort = (value) =>
  `₱${Math.round(Number(value) || 0).toLocaleString('en-PH')}`;

/** ₱14.8k — used in tight donut centres. */
export const pesoCompact = (value) => {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}k`;
  return `₱${Math.round(n)}`;
};

export const num = (value) => Number(value || 0).toLocaleString('en-PH');

/** "Mon, Sep 21" */
export const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '—';

/** "August 6, 2026" */
export const longDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

/** "12:01 PM" */
export const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '—';

export const percent = (value, total) => {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total)) * 100);
};

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase() || '?';

/** Human label for a payment method key. */
export const paymentLabel = (method) =>
  ({ cash: 'Cash', gcash: 'GCash', on_account: 'Pay Later' }[method] || method);

export const customerTypeLabel = (type) =>
  ({ walk_in: 'Walk-in', regular: 'Regular', delivery: 'Delivery' }[type] || type);

export const containerHandlingLabel = (mode) =>
  ({
    exchange_1to1: '1:1 Exchange',
    new_container: 'New Container',
    borrowing: 'Borrowing',
  }[mode] || mode);

export const roleLabel = (role) =>
  ({ clerk: 'Clerk', driver: 'Driver', operator: 'Operator', admin: 'Admin' }[role] || role);

/** Progress-bar / status colour for quota states. */
export const quotaTone = (status) =>
  ({
    'Quota Met': 'success',
    'On Track': 'info',
    'Almost There': 'info',
    Lagging: 'danger',
  }[status] || 'info');

export const stockTone = (status) =>
  ({
    'In Stock': 'success',
    'Low Stock': 'warning',
    Critical: 'danger',
    'Out of Stock': 'danger',
  }[status] || 'neutral');

/** Tiles the "▼ 2 critical" style delta chips. */
export const deltaTone = (value) => {
  if (value === null || value === undefined) return 'neutral';
  if (value > 0) return 'success';
  if (value < 0) return 'danger';
  return 'neutral';
};

export const deltaText = (value, suffix = '') => {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
};
