import * as svc from './users.service.js';
import * as importSvc from './users.import.service.js';

export const directory = async (req, res) => res.json(await svc.directory(req.query));
export const myDelegations = async (req, res) => res.json(await svc.myDelegations(req.user.id));
export const createDelegation = async (req, res) => res.status(201).json(await svc.createDelegation(req.user, req.body));
export const revokeDelegation = async (req, res) => res.json(await svc.revokeDelegation(req.user, req.params.id));
export const list = async (req, res) => res.json(await svc.listUsers(req.query));
export const create = async (req, res) => res.status(201).json(await svc.createUser(req.user, req.body));
export const update = async (req, res) => res.json(await svc.updateUser(req.user, req.params.id, req.body));

export const importTemplate = (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="people-import-template.csv"');
  res.send(importSvc.TEMPLATE);
};
export const startImport = async (req, res) => res.status(202).json(await importSvc.startImport(req.user, req.file, req.body));
export const importJob = async (req, res) => res.json(await importSvc.getJob(req.params.id));
export const importJobs = async (_req, res) => res.json(await importSvc.recentJobs());
