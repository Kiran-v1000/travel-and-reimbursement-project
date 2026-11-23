import { get, post } from '../../../shared/lib/api.js';

export const approvalsApi = {
  inbox: () => get('/approvals/inbox'),
  history: () => get('/approvals/history'),
  act: (stepId, action, comment) => post(`/approvals/${stepId}/act`, { action, comment }),
  bulkApprove: (stepIds, comment) => post('/approvals/bulk-approve', { stepIds, comment }),
  entity: (type, id) => get(type === 'TRAVEL' ? `/travel/${id}` : `/expenses/${id}`),
};
