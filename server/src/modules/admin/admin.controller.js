import * as svc from './admin.service.js';

export const reference = async (_req, res) => res.json(await svc.reference());

export const listRules = async (_req, res) => res.json(await svc.listRules());
export const createRule = async (req, res) => res.status(201).json(await svc.createRule(req.user, req.body));
export const updateRule = async (req, res) => res.json(await svc.updateRule(req.user, req.params.id, req.body));
export const deleteRule = async (req, res) => res.json(await svc.deleteRule(req.user, req.params.id));
export const simulate = async (req, res) => res.json(await svc.simulate(req.body));

export const listCategories = async (_req, res) => res.json(await svc.listAllCategories());
export const createCategory = async (req, res) => res.status(201).json(await svc.upsertCategory(req.user, null, req.body));
export const updateCategory = async (req, res) => res.json(await svc.upsertCategory(req.user, req.params.id, req.body));

export const listCurrencies = async (_req, res) => res.json(await svc.listAllCurrencies());
export const upsertCurrency = async (req, res) => res.json(await svc.upsertCurrency(req.user, req.params.code.toUpperCase(), req.body));

export const listDepartments = async (_req, res) => res.json(await svc.listDepartments());
export const createDepartment = async (req, res) => res.status(201).json(await svc.upsertDepartment(req.user, null, req.body));
export const updateDepartment = async (req, res) => res.json(await svc.upsertDepartment(req.user, req.params.id, req.body));

export const listCostCenters = async (_req, res) => res.json(await svc.listCostCenters());
export const createCostCenter = async (req, res) => res.status(201).json(await svc.upsertCostCenter(req.user, null, req.body));
export const updateCostCenter = async (req, res) => res.json(await svc.upsertCostCenter(req.user, req.params.id, req.body));

export const getSettings = async (_req, res) => res.json(await svc.allSettings());
export const updateSettings = async (req, res) => res.json(await svc.updateSettings(req.user, req.body));
