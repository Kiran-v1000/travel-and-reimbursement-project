import { get } from '../../../shared/lib/api.js';

export const dashboardApi = { get: () => get('/reports/dashboard') };
