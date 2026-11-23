import { get, post, put, del, download } from '../../../shared/lib/api.js';

export const travelApi = {
  list: (params) => get('/travel', params),
  get: (id) => get(`/travel/${id}`),
  linkable: () => get('/travel/linkable'),
  create: (body) => post('/travel', body),
  update: (id, body) => put(`/travel/${id}`, body),
  preview: (body) => post('/travel/policy-preview', body),
  submit: (id, exceptionReason) => post(`/travel/${id}/submit`, { exceptionReason }),
  withdraw: (id) => post(`/travel/${id}/withdraw`),
  remove: (id) => del(`/travel/${id}`),
  exportCsv: (params) => download('/travel/export', params, 'travel-requests.csv'),
};
