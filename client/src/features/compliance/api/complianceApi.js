import { get, post } from '../../../shared/lib/api.js';

export const complianceApi = {
  holds: (status) => get('/compliance/holds', { status }),
  placeHold: (body) => post('/compliance/holds', body),
  releaseHold: (id, reason) => post(`/compliance/holds/${id}/release`, { reason }),
  retention: () => get('/compliance/retention'),
  runs: () => get('/compliance/retention/runs'),
  startRun: () => post('/compliance/retention/run'),
};
