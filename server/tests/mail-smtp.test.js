// SMTP mode: mail really goes out through the configured server, and a refused message fails loudly.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { boot, ADMIN } from './helpers.js';

// minimal SMTP server: accepts everything, or refuses recipients while `reject` is true
const received = []; let reject = false;
const smtp = net.createServer((sock) => {
  let data = false; let buf = ''; let msg = { rcpt: [], body: '' };
  const say = (l) => sock.write(`${l}\r\n`);
  say('220 test ESMTP');
  sock.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (line === '.') { data = false; received.push(msg); msg = { rcpt: [], body: '' }; say('250 OK queued'); } else msg.body += `${line}\n`; continue; }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') say('250 test');
      else if (cmd === 'MAIL') say('250 OK');
      else if (cmd === 'RCPT') { if (reject) say('550 No such user'); else { msg.rcpt.push(line); say('250 OK'); } }
      else if (cmd === 'DATA') { data = true; say('354 go ahead'); }
      else if (cmd === 'QUIT') { say('221 bye'); sock.end(); }
      else if (cmd === 'RSET' || cmd === 'NOOP') say('250 OK');
      else say('502 not implemented');
    }
  });
  sock.on('error', () => {});
});

let t; let adminTok; const errors = []; let origError;
before(async () => {
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  origError = console.error; console.error = (...a) => { errors.push(a.join(' ')); };
  t = await boot({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_SECURE: 'false', SMTP_USER: '', MAIL_FROM: 'Meridian <no-reply@test.local>' });
  adminTok = await t.login(ADMIN.email, ADMIN.password);
});
after(async () => { console.error = origError; await t.close(); smtp.close(); });

test('SMTP configured: status shows it and the test email is delivered to the admin', async () => {
  const st = await t.api('GET', '/api/admin/email', { token: adminTok });
  assert.equal(st.body.mode, 'smtp');
  assert.equal(st.body.smtp.host, '127.0.0.1');
  assert.ok(!JSON.stringify(st.body).includes('SMTP_PASS'));
  const r = await t.api('POST', '/api/admin/test-email', { token: adminTok });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'smtp');
  assert.equal(r.body.savedToOutbox, false);
  const m = received.find((x) => x.body.includes('test email'));
  assert.ok(m, 'message reached the SMTP server');
  assert.match(m.rcpt.join(), new RegExp(ADMIN.email.replace('.', '\\.')));
  assert.equal(t.outbox().length, 0, 'nothing written to the dev outbox');
});

test('SMTP refusing the message: endpoint returns 502, error logged and listed', async () => {
  reject = true;
  const r = await t.api('POST', '/api/admin/test-email', { token: adminTok });
  reject = false;
  assert.equal(r.status, 502);
  assert.match(r.body.error, /SMTP could not send/);
  assert.ok(errors.some((e) => e.includes('[mail] !!! FAILED')), 'loud error in the server log');
  const list = await t.api('GET', '/api/admin/emails?status=failed', { token: adminTok });
  assert.ok(list.body.rows.length >= 1);
  assert.equal(list.body.rows[0].html, undefined);
});
