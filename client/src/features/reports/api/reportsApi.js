import { get, download } from '../../../shared/lib/api.js';

export const reportsApi = {
  analytics: (params) => get('/reports/analytics', params),
  exportCsv: (kind, params) => download(`/reports/analytics/export/${kind}`, params, `${kind}-report.csv`),
};
