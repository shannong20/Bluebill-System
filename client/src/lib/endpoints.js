/**
 * Every backend endpoint in one place. Pages call these instead of building
 * URLs inline, so the API surface is easy to audit and change.
 */
import { api } from './api';

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
};

export const dashboardApi = {
  summary: (params) => api.get(`/dashboard/summary${api.qs(params)}`),
  notifications: () => api.get('/dashboard/notifications'),
};

export const productApi = {
  list: (params) => api.get(`/products${api.qs(params)}`),
  create: (body) => api.post('/products', body),
  update: (id, body) => api.put(`/products/${id}`, body),
  remove: (id) => api.delete(`/products/${id}`),
};

export const orderApi = {
  list: (params) => api.get(`/orders${api.qs(params)}`),
  get: (id) => api.get(`/orders/${id}`),
  getByCode: (code) => api.get(`/orders/code/${code}`),
  create: (body) => api.post('/orders', body),
  setStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  recent: (limit = 8) => api.get(`/orders/recent${api.qs({ limit })}`),
  metrics: (params) => api.get(`/orders/metrics/summary${api.qs(params)}`),
};

export const inventoryApi = {
  list: (params) => api.get(`/inventory${api.qs(params)}`),
  summary: () => api.get('/inventory/summary'),
  alerts: () => api.get('/inventory/alerts'),
  // Stock items flagged "Sell at POS" — this is what the POS Supplies grid
  // renders, so the till and the Inventory table can never drift apart.
  posSupplies: (params) => api.get(`/inventory/pos-supplies${api.qs(params)}`),
  create: (body) => api.post('/inventory', body),
  update: (id, body) => api.put(`/inventory/${id}`, body),
  remove: (id) => api.delete(`/inventory/${id}`),
  archive: (id) => api.post(`/inventory/${id}/archive`),
  restore: (id) => api.post(`/inventory/${id}/restore`),
  restock: (id, quantity, note) =>
    api.post(`/inventory/${id}/restock`, { quantity, note }),
};

export const containerApi = {
  list: (params) => api.get(`/containers${api.qs(params)}`),
  summary: () => api.get('/containers/summary'),
  create: (body) => api.post('/containers', body),
  update: (id, body) => api.put(`/containers/${id}`, body),
  returnMany: (containerIds, condition) =>
    api.post('/containers/return', { containerIds, condition }),
};

export const customerApi = {
  list: (params) => api.get(`/customers${api.qs(params)}`),
  withCredit: () => api.get('/customers/with-credit'),
  create: (body) => api.post('/customers', body),
  update: (id, body) => api.put(`/customers/${id}`, body),
  settle: (id, amount) => api.post(`/customers/${id}/settle`, { amount }),
};

export const employeeApi = {
  list: (params) => api.get(`/employees${api.qs(params)}`),
  performance: (params) => api.get(`/employees/performance${api.qs(params)}`),
  create: (body) => api.post('/employees', body),
  update: (id, body) => api.put(`/employees/${id}`, body),
  remove: (id) => api.delete(`/employees/${id}`),
  archive: (id) => api.post(`/employees/${id}/archive`),
  restore: (id) => api.post(`/employees/${id}/restore`),
  setTargets: (targets) => api.post('/employees/targets', { targets }),
};

export const reportApi = {
  daily: (params) => api.get(`/reports/daily${api.qs(params)}`),
  // Reporting Engine — Daily/Weekly/Monthly/Yearly analytics payload
  // (sales + receivables, order volume + delivery fulfillment, gallons).
  summary: (params) => api.get(`/reports/summary${api.qs(params)}`),
  shifts: (params) => api.get(`/reports/shifts${api.qs(params)}`),
  activeShift: () => api.get('/reports/shifts/active'),
  startShift: (body) => api.post('/reports/shifts', body),
  reconcile: (shiftId, body) => api.patch(`/reports/shifts/${shiftId}/reconcile`, body),
};

const BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

/** Triggers a browser download of a server-rendered CSV. */
export async function downloadCsv(path, filename) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('aquapure_token')}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

