import * as holds from './compliance.holds.service.js';
import * as retention from './compliance.retention.service.js';

export const listHolds = async (req, res) => res.json(await holds.list({ status: String(req.query.status ?? 'ACTIVE') }));
export const placeHold = async (req, res) => res.status(201).json(await holds.place(req.user, req.body));
export const releaseHold = async (req, res) => res.json(await holds.release(req.user, req.params.id, req.body));
export const retentionPreview = async (_req, res) => res.json(await retention.preview());
export const retentionRuns = async (_req, res) => res.json(await retention.runs());
export const startRetention = async (req, res) => res.status(202).json(await retention.start({ trigger: 'MANUAL', user: req.user }));
