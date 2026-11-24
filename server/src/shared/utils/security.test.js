// Unit tests for security helpers: malware scanning (against a fake clamd), log redaction,
// and audit-detail redaction. No database needed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_URL ??= 'postgresql://unit:unit@localhost:5432/unit';
process.env.JWT_SECRET ??= 'unit-test-secret-unit-test-secret-0123';

const { scanFile } = await import('./malwareScan.js');
const { redactUrl } = await import('./redact.js');
const { redact } = await import('../../modules/audit/audit.service.js');

// Standard antivirus test string (harmless; every scanner flags it).
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voyage-scan-'));
const clean = path.join(tmp, 'clean.pdf');
const infected = path.join(tmp, 'infected.pdf');
fs.writeFileSync(clean, '%PDF-1.4\n%%EOF\n');
fs.writeFileSync(infected, `%PDF-1.4\n${EICAR}\n%%EOF\n`);

/** A tiny clamd stand-in speaking the INSTREAM protocol. */
function fakeClamd(mode = 'normal') {
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (mode === 'silent') return;
      const cmd = 'zINSTREAM\0';
      if (buf.length < cmd.length) return;
      let off = cmd.length;
      const body = [];
      while (off + 4 <= buf.length) {
        const len = buf.readUInt32BE(off);
        if (len === 0) {
          const text = Buffer.concat(body).toString('latin1');
          sock.end(text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
          return;
        }
        if (off + 4 + len > buf.length) return;
        body.push(buf.subarray(off + 4, off + 4 + len));
        off += 4 + len;
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const servers = [];
after(() => {
  servers.forEach((s) => s.close());
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('clean file passes the scan', async () => {
  const s = await fakeClamd();
  servers.push(s);
  assert.deepEqual(await scanFile(clean, { host: '127.0.0.1', port: s.address().port, timeoutMs: 3000 }), { clean: true });
});

test('infected file is reported with its signature', async () => {
  const s = await fakeClamd();
  servers.push(s);
  const r = await scanFile(infected, { host: '127.0.0.1', port: s.address().port, timeoutMs: 3000 });
  assert.equal(r.clean, false);
  assert.equal(r.signature, 'Eicar-Test-Signature');
});

test('unreachable scanner fails closed (rejects)', async () => {
  await assert.rejects(scanFile(clean, { host: '127.0.0.1', port: 1, timeoutMs: 2000 }), /unavailable|timed out/);
});

test('scanner that never answers times out (rejects)', async () => {
  const s = await fakeClamd('silent');
  servers.push(s);
  await assert.rejects(scanFile(clean, { host: '127.0.0.1', port: s.address().port, timeoutMs: 300 }), /timed out/);
});

test('log redaction removes sign-in codes and tokens but keeps the rest', () => {
  assert.equal(redactUrl('/api/auth/sso/callback?code=SECRETCODE&state=abc&session_state=x'), '/api/auth/sso/callback?code=[redacted]&state=[redacted]&session_state=[redacted]');
  assert.equal(redactUrl('/api/expenses?page=2&status=PAID'), '/api/expenses?page=2&status=PAID');
  assert.equal(redactUrl('/api/x?access_token=abc&q=hello'), '/api/x?access_token=[redacted]&q=hello');
  assert.equal(redactUrl('/api/health'), '/api/health');
});

test('audit details never keep passwords, tokens or account numbers', () => {
  const out = redact({ email: 'a@b.c', password: 'Hunter2!', nested: { accessToken: 't', cardNumber: '4111', amount: 10 }, passwordReset: true, list: [{ apiKey: 'k' }] });
  assert.equal(out.email, 'a@b.c');
  assert.equal(out.password, '[redacted]');
  assert.equal(out.nested.accessToken, '[redacted]');
  assert.equal(out.nested.cardNumber, '[redacted]');
  assert.equal(out.nested.amount, 10);
  assert.equal(out.passwordReset, true, 'boolean flags are kept');
  assert.equal(out.list[0].apiKey, '[redacted]');
});
