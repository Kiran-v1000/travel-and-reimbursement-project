import { get, post, put, patch, del } from '../../../shared/lib/api.js';

export const adminApi = {
  rules: () => get('/admin/rules'),
  createRule: (b) => post('/admin/rules', b),
  updateRule: (id, b) => put(`/admin/rules/${id}`, b),
  deactivateRule: (id) => del(`/admin/rules/${id}`),
  simulate: (b) => post('/admin/rules/simulate', b),
  users: (params) => get('/users', params),
  createUser: (b) => post('/users', b),
  updateUser: (id, b) => patch(`/users/${id}`, b),
  settings: () => get('/admin/settings'),
  saveSettings: (b) => put('/admin/settings', b),
  categories: () => get('/admin/categories'),
  saveCategory: (id, b) => (id ? put(`/admin/categories/${id}`, b) : post('/admin/categories', b)),
  currencies: () => get('/admin/currencies'),
  saveCurrency: (code, b) => put(`/admin/currencies/${code}`, b),
  departments: () => get('/admin/departments'),
  saveDepartment: (id, b) => (id ? put(`/admin/departments/${id}`, b) : post('/admin/departments', b)),
  costCenters: () => get('/admin/cost-centers'),
  saveCostCenter: (id, b) => (id ? put(`/admin/cost-centers/${id}`, b) : post('/admin/cost-centers', b)),
};
