import { audit } from '../audit/audit.service.js';
import * as svc from './travel.service.js';

const sendCsv = (res, name, csv) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
};

export const list = async (req, res) => res.json(await svc.list(req.user, req.query));
export const linkable = async (req, res) => res.json(await svc.linkable(req.user));
export const exportCsv = async (req, res) => {
  const csv = await svc.exportCsv(req.user, req.query);
  await audit(req.user, 'travel.exported', 'TRAVEL', null, { filters: req.query }, { strict: true });
  sendCsv(res, 'travel-requests.csv', csv);
};
export const policyPreview = async (req, res) => res.json(await svc.policyPreview(req.user, req.body));
export const create = async (req, res) => res.status(201).json(await svc.create(req.user, req.body));
export const get = async (req, res) => res.json(await svc.get(req.user, req.params.id));
export const update = async (req, res) => res.json(await svc.update(req.user, req.params.id, req.body));
export const submit = async (req, res) => res.json(await svc.submit(req.user, req.params.id, req.body));
export const withdraw = async (req, res) => res.json(await svc.withdraw(req.user, req.params.id));
export const remove = async (req, res) => res.json(await svc.remove(req.user, req.params.id));
