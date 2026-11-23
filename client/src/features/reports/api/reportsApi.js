import { api, download } from '../../../shared/lib/api.js';

export const reportsApi = {
  // A first, uncached company-wide report can take a while to compute - allow up to a minute.
  analytics: (params) => api.get('/reports/analytics', { params, timeout: 60_000 }).then((r) => r.data),
  exportCsv: (kind, params) => download(`/reports/analytics/export/${kind}`, params, `${kind}-report.csv`),
};
