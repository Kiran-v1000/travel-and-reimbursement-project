import { get } from '../../../shared/lib/api.js';

export const orgApi = {
  chart: (u) => get('/org/chart', u ? { u } : undefined),
  roots: () => get('/org/roots'),
};
