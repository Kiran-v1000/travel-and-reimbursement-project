import { get } from '../../../shared/lib/api.js';

export const financeApi = {
  queue: (params) => get('/finance/queue', params),
  payments: (status) => get('/finance/payments', { status }),
};
