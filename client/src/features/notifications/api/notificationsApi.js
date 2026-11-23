import { get, post } from '../../../shared/lib/api.js';

export const notificationsApi = {
  list: () => get('/notifications'),
  read: (id) => post(`/notifications/${id}/read`),
  readAll: () => post('/notifications/read-all'),
};
