import { get, post, download } from '../../../shared/lib/api.js';

const day = (d) => new Date(d).toISOString().slice(0, 10);

export const financeApi = {
  queue: (params) => get('/finance/queue', params),
  payments: (status, params) => get('/finance/payments', { status, ...params }),
  exportPreview: ({ from, to }) => get('/finance/accounting-export/preview', { from, to }),
  exports: () => get('/finance/accounting-exports'),
  createExport: (body) => post('/finance/accounting-exports', body),
  downloadExport: (b) =>
    download(`/finance/accounting-exports/${b.id}/download`, undefined,
      `voyage-reimbursements_${day(b.fromDate)}_to_${day(b.toDate)}${b.format === 'TALLY' ? '_tally.xml' : '_journal.csv'}`),
};
