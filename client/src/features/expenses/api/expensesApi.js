import { get, post, put, del, download } from '../../../shared/lib/api.js';

export const expensesApi = {
  list: (params) => get('/expenses', params),
  get: (id) => get(`/expenses/${id}`),
  create: (body) => post('/expenses', body),
  update: (id, body) => put(`/expenses/${id}`, body),
  policy: (id) => get(`/expenses/${id}/policy`),
  addLine: (id, body) => post(`/expenses/${id}/lines`, body),
  updateLine: (id, lineId, body) => put(`/expenses/${id}/lines/${lineId}`, body),
  deleteLine: (id, lineId) => del(`/expenses/${id}/lines/${lineId}`),
  submit: (id, exceptionReason) => post(`/expenses/${id}/submit`, { exceptionReason }),
  withdraw: (id) => post(`/expenses/${id}/withdraw`),
  remove: (id) => del(`/expenses/${id}`),
  linkableTrips: () => get('/travel/linkable'),
  exportCsv: (params) => download('/expenses/export', params, 'expense-reports.csv'),
};
