/**
 * Thin fetch wrapper around the Express API.
 *
 * - Injects the JWT from localStorage
 * - Normalises the server's `{ success, data, meta }` envelope
 * - Throws `ApiError` with the server's message + field details
 */

export const API_URL =
  typeof window === 'undefined'
    ? // Server-side (Next.js functions): use the Vercel service binding.
      // Vercel injects SERVER_URL at runtime in functions only — never at
      // build time and never in middleware.
      process.env.SERVER_URL || process.env.NEXT_PUBLIC_API_URL || '/api'
    : // Browser: same-origin public path. Vercel rewrites /api/* to the
      // server service, so the browser never touches the internal URL.
      process.env.NEXT_PUBLIC_API_URL || '/api';

const TOKEN_KEY = 'aquapure_token';

export const getToken = () =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  if (typeof window !== 'undefined' && token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
};

export const clearToken = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_KEY);
  }
};

export class ApiError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Builds `?a=1&b=2`, dropping empty values. */
export function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request(path, { method = 'GET', body, signal, raw = false } = {}) {
  const token = getToken();

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      'Cannot reach the server. Check NEXT_PUBLIC_API_URL (browser) or SERVER_URL (server).',
      { status: 0 },
    );
  }

  if (raw) return res;

  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError('The server returned an unexpected response.', {
      status: res.status,
    });
  }

  if (!res.ok || payload.success === false) {
    throw new ApiError(payload.message || `Request failed (${res.status})`, {
      status: res.status,
      details: payload.details,
    });
  }

  return payload; // { success, data, meta }
}

const qs = toQuery;

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  qs,
};
