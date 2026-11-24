import { get, post } from '../../../shared/lib/api.js';

export const helpApi = {
  feedback: (slug, helpful) => post('/help/feedback', { slug, helpful }),
  stats: () => get('/help/feedback'),
};
