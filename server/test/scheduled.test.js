import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

let server; let base; let db; let app;
const outbox = [];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.INVITE_GAP_MS = '0';
  process.env.LAUNCH_EMAIL_GAP_MS = '0';
  process.env.LAUNCH_DATE = '2026-11-24';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-sched-');
  db = openDb(':memory:');
  app = createApp(db, { mailer: async (m) => { outbox.push(m); }, pusher: async (msgs) => msgs.map(() => ({ status: 'ok' })),
    moderator: async () => ({ verdict: 'allow', category: 'none', note: '' }) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); delete process.env.LAUNCH_DATE; });

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const user = (email, role, name) => Number(db.prepare("INSERT INTO users (email, password_hash, role, name, country, email_verified) VALUES (?,?,?,?, 'SE', 1)")
  .run(email, hashPassword('password123'), role, name).lastInsertRowid);
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: 'password123' })).body.token;
const due = (id) => db.prepare("UPDATE scheduled_sends SET run_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(id);

test('admin schedules a message and the launch email; they go out at their time and can be cancelled', async () => {
  user('admin@test.io', 'admin', 'Admin');
  const anna = user('anna@test.io', 'family', 'Anna Svensson');
  const admin = await login('admin@test.io');
  const soon = new Date(Date.now() + 3600000).toISOString();

  // Bad times are refused; only admins can schedule.
  assert.equal((await call(admin, 'POST', '/admin/messages', { text: 'Launch day is here!', audience: { roles: ['family'] }, send_at: '2001-01-01T00:00:00Z' })).status, 400);
  assert.equal((await call(await login('anna@test.io'), 'POST', '/admin/launch-email/schedule', { at: soon })).status, 403);

  // A scheduled message sends nothing until its time.
  let r = await call(admin, 'POST', '/admin/messages', { text: 'Hi {name}, launch day is here!', subject: 'We are live', email: true, audience: { roles: ['family', 'aupair'] }, send_at: soon });
  assert.equal(r.status, 200);
  const msgJob = r.body.scheduled;
  assert.ok(msgJob);
  await app.runScheduled();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_messages').get().n, 0);
  assert.equal((await call(admin, 'GET', '/admin/messages')).body.scheduled[0].status, 'scheduled');

  // Someone who joins before it goes out gets it too.
  const maria = user('maria@test.io', 'aupair', 'Maria Lopez');
  due(msgJob);
  await app.runScheduled();
  const sent = db.prepare('SELECT user_id FROM admin_message_recipients ORDER BY user_id').all().map((x) => x.user_id);
  assert.deepEqual(sent, [anna, maria]);
  assert.equal(db.prepare('SELECT status FROM scheduled_sends WHERE id = ?').get(msgJob).status, 'done');
  await app.runScheduled();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_messages').get().n, 1, 'never sent twice');

  // Cancelling.
  r = await call(admin, 'POST', '/admin/messages', { text: 'Another message here', audience: { roles: ['family'] }, send_at: soon });
  assert.equal((await call(admin, 'POST', `/admin/scheduled/${r.body.scheduled}/cancel`)).status, 200);
  due(r.body.scheduled);
  await app.runScheduled();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_messages').get().n, 1);

  // The launch email: scheduled for launch day, it waits if launch day hasn't come, then sends to everyone.
  db.prepare("INSERT INTO waitlist (email, role, lang, token) VALUES ('wait@test.io', 'family', 'en', 'tok1')").run();
  assert.equal((await call(admin, 'POST', '/admin/launch-email/schedule', { at: soon })).status, Date.now() < Date.parse('2026-11-24T00:00:00Z') ? 400 : 200, 'not before launch day');
  db.prepare('DELETE FROM scheduled_sends WHERE kind = ?').run('launch_email');
  const launchAt = new Date(Math.max(Date.parse('2026-11-24T06:00:00Z'), Date.now() + 3600000)).toISOString();
  r = await call(admin, 'POST', '/admin/launch-email/schedule', { at: launchAt });
  assert.equal(r.status, 200);
  assert.equal(r.body.scheduled.length, 1);
  due(r.body.id);
  outbox.length = 0;
  await app.runScheduled();
  await new Promise((res) => setTimeout(res, 50));
  const launchMails = outbox.filter((m) => /app is here/i.test(m.subject));
  // LAUNCH_DATE 2026-11-24: before then it is put back to launch day; from then it sends.
  if (Date.now() < Date.parse('2026-11-24T00:00:00Z')) {
    assert.equal(launchMails.length, 0);
    assert.equal(db.prepare('SELECT run_at FROM scheduled_sends WHERE id = ?').get(r.body.id).run_at, '2026-11-24T00:00:00.000Z');
  } else {
    assert.deepEqual(launchMails.map((m) => m.to).sort(), ['anna@test.io', 'maria@test.io', 'wait@test.io']);
    assert.equal(db.prepare('SELECT status FROM scheduled_sends WHERE id = ?').get(r.body.id).status, 'done');
  }
});
