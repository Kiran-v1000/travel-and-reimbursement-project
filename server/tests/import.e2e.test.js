// Bulk HR import: validation catches bad rows and nothing is written on a failed apply.
// Needs a seeded database. Run: npm run test:e2e
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/pool.js';
import { startImport, getJob } from '../src/modules/users/users.import.service.js';

const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
const tag = Date.now();
const csv = (rows) => ({ originalname: 'test.csv', mimetype: 'text/csv', buffer: Buffer.from(['employee_id,name,email,manager_email,department_code,role', ...rows].join('\n')) });

async function run(file, mode, opts = {}) {
  const { jobId } = await startImport(admin, file, { mode, createMissing: false, deactivateMissing: false, ...opts });
  for (let i = 0; i < 200; i++) {
    const job = await getJob(jobId);
    if (job.status !== 'RUNNING') return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('import did not finish');
}

after(async () => {
  const people = await prisma.user.findMany({ where: { email: { contains: `.${tag}@` } }, select: { id: true } });
  await prisma.user.updateMany({ where: { id: { in: people.map((p) => p.id) } }, data: { managerId: null } });
  await prisma.user.deleteMany({ where: { id: { in: people.map((p) => p.id) } } });
  await prisma.$disconnect();
});

test('check reports every problem and changes nothing', async () => {
  const job = await run(
    csv([
      `T${tag}1,,blank.${tag}@utthunga.com,asha@voyage.io,ENG,EMPLOYEE`,
      `T${tag}2,Bad Email,not-an-email,asha@voyage.io,ENG,EMPLOYEE`,
      `T${tag}3,Loop A,a.${tag}@utthunga.com,b.${tag}@utthunga.com,ENG,EMPLOYEE`,
      `T${tag}4,Loop B,b.${tag}@utthunga.com,a.${tag}@utthunga.com,ENG,EMPLOYEE`,
      `T${tag}5,Admin Please,adm.${tag}@utthunga.com,asha@voyage.io,ENG,ADMIN`,
    ]),
    'VALIDATE',
  );
  assert.equal(job.status, 'DONE');
  const problems = job.errors.map((e) => e.field).sort();
  assert.deepEqual(problems, ['email', 'manager_email', 'name', 'role']);
  assert.equal(await prisma.user.count({ where: { email: { contains: `.${tag}@` } } }), 0);
});

test('apply refuses a file with problems', async () => {
  const job = await run(csv([`T${tag}6,Ghost,ghost.${tag}@utthunga.com,nobody.${tag}@utthunga.com,ENG,EMPLOYEE`]), 'APPLY');
  assert.equal(job.status, 'FAILED');
  assert.equal(await prisma.user.count({ where: { email: { contains: `.${tag}@` } } }), 0);
});

test('apply creates people, reporting lines and the org-tree path', async () => {
  const job = await run(
    csv([
      `T${tag}7,Lead Person,lead.${tag}@utthunga.com,asha@voyage.io,ENG,`,
      `T${tag}8,Team Member,member.${tag}@utthunga.com,lead.${tag}@utthunga.com,ENG,EMPLOYEE`,
    ]),
    'APPLY',
  );
  assert.equal(job.status, 'DONE');
  const lead = await prisma.user.findUnique({ where: { email: `lead.${tag}@utthunga.com` } });
  const member = await prisma.user.findUnique({ where: { email: `member.${tag}@utthunga.com` } });
  const asha = await prisma.user.findUnique({ where: { email: 'asha@voyage.io' } });
  assert.equal(lead.role, 'MANAGER', 'people with reports become managers');
  assert.equal(member.managerId, lead.id);
  assert.deepEqual(member.ancestors, [...asha.ancestors, asha.id, lead.id]);

  const again = await run(csv([`T${tag}7,Lead Person,lead.${tag}@utthunga.com,asha@voyage.io,ENG,MANAGER`, `T${tag}8,Team Member,member.${tag}@utthunga.com,lead.${tag}@utthunga.com,ENG,EMPLOYEE`]), 'VALIDATE');
  assert.equal(again.summary.unchanged, 2, 're-importing the same file changes nothing');
});
