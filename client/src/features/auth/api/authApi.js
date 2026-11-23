import { get, post } from '../../../shared/lib/api.js';

export const authApi = {
  config: () => get('/auth/config'),
  login: (email, password) => post('/auth/login', { email, password }),
  logout: () => post('/auth/logout'),
  me: () => get('/auth/me'),
};
