/**
 * Bulk HR import from CSV (built for ~100k rows).
 *
 * Columns (header row, any order, case-insensitive):
 *   employee_id*, name*, email*, manager_email, department_code, department_name,
 *   cost_center_code, cost_center_name, role, title, location, active
 *
 * Rows are matched to existing people by employee_id. Two passes:
 *   VALIDATE - check every row, report what would change and every problem (no writes)
 *   APPLY    - run the same checks, refuse if anything is wrong, then write in batches
 * Jobs run in the background and report progress through the ImportJob table.
 */
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../shared/errors/AppError.js';
import { rebuildOrgTree } from '../../shared/utils/orgTree.js';
import { audit } from '../audit/audit.service.js';

const MAX_ROWS = 200_000;
const MAX_ERRORS = 500;
const ROLES = ['EMPLOYEE', 'MANAGER', 'FINANCE', 'AUDITOR']; // ADMIN is granted in the UI only
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRUE = new Set(['true', 'yes', 'y', '1', 'active']);
const FALSE = new Set(['false', 'no', 'n', '0', 'inactive']);

export const TEMPLATE = [
  'employee_id,name,email,manager_email,department_code,department_name,cost_center_code,cost_center_name,role,title,location,active',
  'E2001,Kavya Reddy,kavya.reddy@utthunga.com,vikram@voyage.io,ENG,Engineering,CC-210,Engineering R&D,MANAGER,Engineering Manager,Bengaluru,true',
  'E2002,Arun Prakash,arun.prakash@utthunga.com,kavya.reddy@utthunga.com,ENG,Engineering,CC-210,Engineering R&D,EMPLOYEE,Software Engineer,Bengaluru,true',
].join('\n');

const norm = (v) => (v == null ? '' : String(v).trim());

function parseCsv(buffer) {
  let records;
  try {
    records = parse(buffer, { columns: (h) => h.map((c) => norm(c).toLowerCase().replace(/\s+/g, '_')), bom: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch (err) {
    throw badRequest(`This file could not be read as CSV: ${err.message}`);
  }
  if (!records.length) throw badRequest('The file has no data rows.');
  if (records.length > MAX_ROWS) throw badRequest(`The file has ${records.length.toLocaleString('en-IN')} rows; the limit is ${MAX_ROWS.toLocaleString('en-IN')} per import.`);
  const missing = ['employee_id', 'name', 'email'].filter((c) => !(c in records[0]));
  if (missing.length) throw badRequest(`Missing required column(s): ${missing.join(', ')}. Download the template for the expected layout.`);
  return records;
}

/**
 * Check every row against the file and the database. Pure planning - no writes.
 * Returns { plan, summary, errors }.
 */
async function buildPlan(records, { createMissing, deactivateMissing }, actorId) {
  const errors = [];
  const err = (row, field, message) => errors.length < MAX_ERRORS && errors.push({ row, field, message });

  const [existing, depts, ccs] = await Promise.all([
    prisma.user.findMany({ select: { id: true, employeeId: true, email: true, name: true, role: true, title: true, location: true, active: true, managerId: true, departmentId: true, costCenterId: true } }),
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.costCenter.findMany({ select: { id: true, code: true } }),
  ]);
  const byEmpId = new Map(existing.map((u) => [u.employeeId.toLowerCase(), u]));
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));
  const byId = new Map(existing.map((u) => [u.id, u]));
  const deptByCode = new Map(depts.map((d) => [d.code.toUpperCase(), d.id]));
  const ccByCode = new Map(ccs.map((c) => [c.code.toUpperCase(), c.id]));
  const newDepts = new Map();
  const newCcs = new Map();

  const rows = [];
  const seenEmp = new Map();
  const seenEmail = new Map();

  records.forEach((r, i) => {
    const row = i + 2; // spreadsheet row number (header is row 1)
    const employeeId = norm(r.employee_id);
    const name = norm(r.name);
    const email = norm(r.email).toLowerCase();
    let ok = true;
    if (!employeeId) { err(row, 'employee_id', 'Employee ID is required'); ok = false; }
    if (!name) { err(row, 'name', 'Name is required'); ok = false; }
    if (!EMAIL.test(email)) { err(row, 'email', `"${r.email ?? ''}" is not a valid email`); ok = false; }
    if (employeeId && seenEmp.has(employeeId.toLowerCase())) { err(row, 'employee_id', `Duplicate employee ID (also on row ${seenEmp.get(employeeId.toLowerCase())})`); ok = false; }
    if (email && seenEmail.has(email)) { err(row, 'email', `Duplicate email (also on row ${seenEmail.get(email)})`); ok = false; }
    seenEmp.set(employeeId.toLowerCase(), row);
    seenEmail.set(email, row);

    const role = norm(r.role).toUpperCase() || null;
    if (role === 'ADMIN') { err(row, 'role', 'Administrator access can only be granted in Administration → People'); ok = false; }
    else if (role && !ROLES.includes(role)) { err(row, 'role', `Unknown role "${r.role}" (use ${ROLES.join(', ')})`); ok = false; }

    let active = true;
    const a = norm(r.active).toLowerCase();
    if (a) {
      if (TRUE.has(a)) active = true;
      else if (FALSE.has(a)) active = false;
      else { err(row, 'active', `"${r.active}" should be true or false`); ok = false; }
    }

    const resolveCode = (code, field, map, pending, nameCol) => {
      const label = field === 'department_code' ? 'department' : 'cost center';
      const c = norm(code).toUpperCase();
      if (!c) return undefined;
      if (map.has(c)) return map.get(c);
      if (createMissing) {
        if (!pending.has(c)) pending.set(c, norm(nameCol) || c);
        return `new:${c}`;
      }
      err(row, field, `Unknown ${label} "${c}" (tick "create missing" to add it)`);
      ok = false;
      return undefined;
    };
    const departmentId = resolveCode(r.department_code, 'department_code', deptByCode, newDepts, r.department_name);
    const costCenterId = resolveCode(r.cost_center_code, 'cost_center_code', ccByCode, newCcs, r.cost_center_name);

    const current = byEmpId.get(employeeId.toLowerCase());
    const emailOwner = byEmail.get(email);
    if (emailOwner && emailOwner.employeeId.toLowerCase() !== employeeId.toLowerCase()) {
      err(row, 'email', `${email} already belongs to ${emailOwner.name} (${emailOwner.employeeId})`);
      ok = false;
    }
    if (current && current.id === actorId && active === false) { err(row, 'active', 'You cannot deactivate your own account'); ok = false; }

    rows.push({ row, ok, employeeId, name, email, managerEmail: norm(r.manager_email).toLowerCase(), role, title: norm(r.title) || null, location: norm(r.location) || null, active, departmentId, costCenterId, current });
  });

  // Managers: must be in this file or already in the system, never the person themself.
  const fileEmails = new Set(rows.map((x) => x.email));
  for (const x of rows) {
    if (!x.managerEmail) continue;
    if (x.managerEmail === x.email) { err(x.row, 'manager_email', 'A person cannot report to themselves'); x.ok = false; continue; }
    if (!fileEmails.has(x.managerEmail) && !byEmail.has(x.managerEmail)) {
      err(x.row, 'manager_email', `Manager ${x.managerEmail} is not in this file or in the system`);
      x.ok = false;
    }
  }

  // Reporting loops across the final hierarchy (file rows override what is stored today).
  const managerOf = new Map();
  for (const u of existing) managerOf.set(u.email.toLowerCase(), u.managerId ? byId.get(u.managerId)?.email.toLowerCase() : null);
  for (const x of rows) managerOf.set(x.email, x.managerEmail || null);
  const state = new Map(); // 1 = visiting, 2 = done
  const rowByEmail = new Map(rows.map((x) => [x.email, x]));
  for (const start of managerOf.keys()) {
    if (state.get(start) === 2) continue;
    const path = [];
    let cur = start;
    while (cur && state.get(cur) !== 2) {
      if (state.get(cur) === 1) {
        const loop = path.slice(path.indexOf(cur));
        const inFile = loop.map((e) => rowByEmail.get(e)).filter(Boolean);
        const where = inFile[0] ?? null;
        if (where) {
          err(where.row, 'manager_email', `Reporting loop: ${loop.join(' → ')} → ${cur}`);
          inFile.forEach((r) => { r.ok = false; });
        }
        break;
      }
      state.set(cur, 1);
      path.push(cur);
      cur = managerOf.get(cur);
    }
    path.forEach((p) => state.set(p, 2));
  }

  // What would change.
  let toCreate = 0;
  let toUpdate = 0;
  let unchanged = 0;
  let managerChanges = 0;
  for (const x of rows) {
    if (!x.current) { toCreate++; if (x.managerEmail) managerChanges++; continue; }
    const c = x.current;
    const currentMgr = c.managerId ? byId.get(c.managerId)?.email.toLowerCase() ?? null : null;
    x.managerChanged = (x.managerEmail || null) !== currentMgr;
    if (x.managerChanged) managerChanges++;
    x.fieldsChanged =
      c.name !== x.name || c.email.toLowerCase() !== x.email || (x.role && c.role !== x.role) || (c.title ?? null) !== x.title ||
      (c.location ?? null) !== x.location || c.active !== x.active ||
      (x.departmentId !== undefined && c.departmentId !== x.departmentId) || (x.costCenterId !== undefined && c.costCenterId !== x.costCenterId);
    if (x.fieldsChanged) toUpdate++;
    else if (!x.managerChanged) unchanged++;
  }
  const inFileEmp = new Set(rows.map((x) => x.employeeId.toLowerCase()));
  const deactivate = deactivateMissing
    ? existing.filter((u) => u.active && u.role !== 'ADMIN' && u.id !== actorId && !inFileEmp.has(u.employeeId.toLowerCase()))
    : [];

  const errorCount = errors.length >= MAX_ERRORS ? `${MAX_ERRORS}+` : errors.length;
  return {
    plan: { rows, newDepts, newCcs, deactivate, existing },
    summary: {
      rows: rows.length, toCreate, toUpdate, unchanged, managerChanges, toDeactivate: deactivate.length,
      newDepartments: [...newDepts.keys()], newCostCenters: [...newCcs.keys()], errorCount, invalidRows: rows.filter((r) => !r.ok).length,
    },
    errors,
  };
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Write the plan in batches. Only called when validation found no problems. */
async function applyPlan(plan, jobId, total) {
  const { rows, newDepts, newCcs, deactivate } = plan;
  const progress = (n) => prisma.importJob.update({ where: { id: jobId }, data: { processed: Math.min(n, total) } });

  for (const [code, name] of newDepts) {
    const d = await prisma.department.upsert({ where: { code }, create: { code, name }, update: {} });
    newDepts.set(code, d.id);
  }
  for (const [code, name] of newCcs) {
    const c = await prisma.costCenter.upsert({ where: { code }, create: { code, name }, update: {} });
    newCcs.set(code, c.id);
  }
  const resolve = (v, map) => (typeof v === 'string' && v.startsWith('new:') ? map.get(v.slice(4)) : v);

  // 1. New people (no password - they sign in with Microsoft).
  const creates = rows.filter((x) => !x.current);
  const managers = new Set(rows.map((o) => o.managerEmail).filter(Boolean));
  let done = 0;
  for (const part of chunk(creates, 1000)) {
    await prisma.user.createMany({
      data: part.map((x) => ({
        employeeId: x.employeeId, name: x.name, email: x.email, role: x.role ?? (managers.has(x.email) ? 'MANAGER' : 'EMPLOYEE'),
        title: x.title, location: x.location, active: x.active,
        departmentId: resolve(x.departmentId, newDepts) ?? null, costCenterId: resolve(x.costCenterId, newCcs) ?? null,
      })),
      skipDuplicates: true,
    });
    done += part.length;
    await progress(done);
  }

  // 2. Changed people - one UPDATE ... FROM (VALUES ...) per 500 rows.
  const updates = rows.filter((x) => x.current && x.fieldsChanged);
  for (const part of chunk(updates, 500)) {
    const values = part.map((x) => Prisma.sql`(${x.current.id}, ${x.name}, ${x.email}, ${x.role ?? x.current.role}, ${x.title}, ${x.location}, ${x.active},
      ${x.departmentId === undefined ? x.current.departmentId : resolve(x.departmentId, newDepts)}, ${x.costCenterId === undefined ? x.current.costCenterId : resolve(x.costCenterId, newCcs)})`);
    await prisma.$executeRaw`
      UPDATE "User" AS u SET name = v.name, email = v.email, role = v.role::"Role", title = v.title, location = v.location, active = v.active,
        "departmentId" = v.dept, "costCenterId" = v.cc, "updatedAt" = now()
      FROM (VALUES ${Prisma.join(values)}) AS v(id, name, email, role, title, location, active, dept, cc)
      WHERE u.id = v.id`;
    done += part.length;
    await progress(done);
  }

  // 3. Reporting lines, now that everyone exists.
  const ids = new Map((await prisma.user.findMany({ where: { email: { in: rows.map((x) => x.email).concat(rows.map((x) => x.managerEmail).filter(Boolean)) } }, select: { id: true, email: true } })).map((u) => [u.email.toLowerCase(), u.id]));
  const managerRows = rows.filter((x) => !x.current ? !!x.managerEmail : x.managerChanged);
  for (const part of chunk(managerRows, 1000)) {
    const values = part.map((x) => Prisma.sql`(${ids.get(x.email)}, ${x.managerEmail ? ids.get(x.managerEmail) : null})`);
    await prisma.$executeRaw`
      UPDATE "User" AS u SET "managerId" = v.manager, "updatedAt" = now()
      FROM (VALUES ${Prisma.join(values)}) AS v(id, manager) WHERE u.id = v.id`;
  }
  // Anyone who now manages people should be able to approve.
  await prisma.$executeRaw`UPDATE "User" SET role = 'MANAGER' WHERE role = 'EMPLOYEE' AND id IN (SELECT DISTINCT "managerId" FROM "User" WHERE "managerId" IS NOT NULL AND active)`;

  // 4. Optional: deactivate people who are no longer in the HR file.
  for (const part of chunk(deactivate.map((u) => u.id), 1000)) {
    await prisma.user.updateMany({ where: { id: { in: part } }, data: { active: false } });
    // Leavers lose access at once: end every session they still have.
    await prisma.session.updateMany({ where: { userId: { in: part }, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'DEACTIVATED' } });
  }

  // 5. Recompute every reporting path in one statement.
  await rebuildOrgTree();
  // 6. Departments without a head get their most senior active member, so
  //    "Department head" approval steps route to a real person.
  await assignMissingDepartmentHeads();
  await progress(total);
}

/** Most senior = shortest reporting path. Never overrides a head an admin already set. */
export const assignMissingDepartmentHeads = () => prisma.$executeRaw`
  UPDATE "Department" d SET "headId" = x.id, "updatedAt" = now()
  FROM (SELECT DISTINCT ON ("departmentId") "departmentId", id FROM "User"
        WHERE active AND "departmentId" IS NOT NULL
        ORDER BY "departmentId", cardinality("ancestors"), "createdAt") x
  WHERE d.id = x."departmentId" AND d."headId" IS NULL`;

// ---------- Jobs ----------

export async function startImport(actor, file, { mode, createMissing, deactivateMissing }) {
  if (!file?.buffer?.length) throw badRequest('Choose a CSV file to import');
  if (!/\.csv$/i.test(file.originalname) && !/csv|text\/plain|excel/.test(file.mimetype)) throw badRequest('Please upload a .csv file');
  const records = parseCsv(file.buffer);
  if (mode === 'APPLY') {
    const running = await prisma.importJob.findFirst({ where: { mode: 'APPLY', status: 'RUNNING', createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) } } });
    if (running) throw conflict('Another import is being applied right now. Please wait for it to finish.');
  }
  const job = await prisma.importJob.create({
    data: { mode, fileName: file.originalname.slice(0, 200), totalRows: records.length, createdById: actor.id, summary: { createMissing, deactivateMissing } },
  });

  // Run in the background; the client polls the job.
  setImmediate(async () => {
    try {
      const { plan, summary, errors } = await buildPlan(records, { createMissing, deactivateMissing }, actor.id);
      if (mode === 'APPLY' && errors.length) {
        await prisma.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', summary: { ...summary, createMissing, deactivateMissing, reason: 'The file has problems - nothing was changed.' }, errors, finishedAt: new Date() } });
        return;
      }
      if (mode === 'APPLY') {
        await applyPlan(plan, job.id, records.length);
        await audit(actor, 'users.imported', 'USER', null, { file: file.originalname, ...summary });
      }
      await prisma.importJob.update({ where: { id: job.id }, data: { status: 'DONE', processed: records.length, summary: { ...summary, createMissing, deactivateMissing }, errors, finishedAt: new Date() } });
    } catch (e) {
      console.error('[import] failed', e);
      await prisma.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', summary: { reason: e.message?.split('\n').pop() ?? 'Import failed' }, finishedAt: new Date() } }).catch(() => {});
    }
  });
  return { jobId: job.id, totalRows: records.length };
}

export async function getJob(id) {
  const job = await prisma.importJob.findUnique({ where: { id } });
  if (!job) throw notFound('Import job');
  // A worker that died mid-run leaves a job RUNNING forever - report it as failed.
  if (job.status === 'RUNNING' && Date.now() - job.createdAt.getTime() > 30 * 60 * 1000) {
    return { ...job, status: 'FAILED', summary: { ...job.summary, reason: 'The import stopped unexpectedly. Please run it again.' } };
  }
  return job;
}

export const recentJobs = () =>
  prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, mode: true, status: true, fileName: true, totalRows: true, summary: true, createdAt: true, finishedAt: true } });
