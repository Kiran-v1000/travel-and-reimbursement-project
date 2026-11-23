import { audit } from '../audit/audit.service.js';
import * as svc from './expenses.service.js';

export const list = async (req, res) => res.json(await svc.list(req.user, req.query));
export const exportCsv = async (req, res) => {
  const csv = await svc.exportCsv(req.user, req.query);
  await audit(req.user, 'expense.exported', 'EXPENSE', null, { filters: req.query });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="expense-reports.csv"');
  res.send(csv);
};
export const create = async (req, res) => res.status(201).json(await svc.create(req.user, req.body));
export const get = async (req, res) => res.json(await svc.get(req.user, req.params.id));
export const update = async (req, res) => res.json(await svc.update(req.user, req.params.id, req.body));
export const policy = async (req, res) => res.json(await svc.policy(req.user, req.params.id));
export const addLine = async (req, res) => res.status(201).json(await svc.addLine(req.user, req.params.id, req.body));
export const updateLine = async (req, res) => res.json(await svc.updateLine(req.user, req.params.id, req.params.lineId, req.body));
export const deleteLine = async (req, res) => res.json(await svc.deleteLine(req.user, req.params.id, req.params.lineId));
export const submit = async (req, res) => res.json(await svc.submit(req.user, req.params.id, req.body));
export const withdraw = async (req, res) => res.json(await svc.withdraw(req.user, req.params.id));
export const remove = async (req, res) => res.json(await svc.remove(req.user, req.params.id));
