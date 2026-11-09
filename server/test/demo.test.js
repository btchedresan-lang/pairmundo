import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { ensureDemoAccounts, DEMO_LOGINS } from '../server/demo.js';

const PASSWORD = 'Review-2026!';
let server; let base; let db;
const outbox = [];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.FAMILY_PASS = 'on';
  const uploadDir = mkdtempSync(`${tmpdir()}/aupair-demo-`);
  process.env.UPLOAD_DIR = uploadDir;
  db = openDb(':memory:');
  assert.equal(ensureDemoAccounts(db, { password: PASSWORD, uploadDir }), 'built');
  const app = createApp(db, { mailer: async (m) => { outbox.push(m); }, pusher: async (msgs) => msgs.map(() => ({ status: 'ok' })) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); delete process.env.FAMILY_PASS; });

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const login = async (email, password = PASSWORD) => {
  const r = await call(null, 'POST', '/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.email_verified, true);
  return r.body.token;
};

test('demo: the family with the Pass has a deck, likes, chats, placements and a review to write', async () => {
  const t = await login(DEMO_LOGINS.family);
  const deck = (await call(t, 'GET', '/discover')).body;
  assert.ok(deck.total >= 4, `deck has ${deck.total}`);
  assert.ok(deck.results.every((r) => r.user.role === 'aupair'));
  const likes = (await call(t, 'GET', '/likes')).body;
  assert.equal(likes.locked, undefined);
  assert.equal(likes.likes.length, 2);
  const convos = (await call(t, 'GET', '/conversations')).body.conversations;
  assert.equal(convos.length, 4);
  const sent = await call(t, 'POST', `/conversations/${convos[0].id}/messages`, { body: 'Hello from App Review' });
  assert.ok([200, 201].includes(sent.status), JSON.stringify(sent.body));
  const pl = (await call(t, 'GET', '/placements')).body.placements;
  assert.deepEqual(pl.map((p) => p.status).sort(), ['completed', 'confirmed']);
  const done = pl.find((p) => p.status === 'completed');
  const rv = await call(t, 'POST', `/placements/${done.id}/review`, { criteria: { childcare: 5, reliability: 5, communication: 5, household: 5, adaptability: 5, accuracy: 5 }, comment: 'Great.' });
  assert.ok([200, 201].includes(rv.status), JSON.stringify(rv.body));
  const upcoming = pl.find((p) => p.status === 'confirmed');
  const sign = await call(t, 'POST', `/placements/${upcoming.id}/agreement/sign`, { name: 'Laura Rivera' });
  assert.equal(sign.status, 200, JSON.stringify(sign.body));
});

test('demo: the family without the Pass sees the paywall', async () => {
  const t = await login(DEMO_LOGINS.family2);
  const likes = (await call(t, 'GET', '/likes')).body;
  assert.equal(likes.locked, true);
  assert.equal(likes.count, 2);
  const [c] = (await call(t, 'GET', '/conversations')).body.conversations;
  assert.equal((await call(t, 'POST', `/conversations/${c.id}/messages`, { body: 'Hi' })).status, 402);
});

test('demo: the au pair has a deck, likes, chats, a placement to confirm and a review to write', async () => {
  const t = await login(DEMO_LOGINS.aupair);
  const deck = (await call(t, 'GET', '/discover')).body;
  assert.ok(deck.total >= 3, `deck has ${deck.total}`);
  assert.equal((await call(t, 'GET', '/likes')).body.likes.length, 2);
  assert.equal((await call(t, 'GET', '/conversations')).body.conversations.length, 3);
  const pl = (await call(t, 'GET', '/placements')).body.placements;
  const proposed = pl.find((p) => p.status === 'proposed');
  assert.equal((await call(t, 'POST', `/placements/${proposed.id}/confirm`)).status, 200);
  const done = pl.find((p) => p.status === 'completed');
  const rv = await call(t, 'POST', `/placements/${done.id}/review`, { criteria: { respect: 5, agreement: 5, accommodation: 5, support: 5, communication: 5, accuracy: 5 } });
  assert.ok([200, 201].includes(rv.status), JSON.stringify(rv.body));
});

test('demo: real members and demo members never see each other, and demo emails are not sent', async () => {
  const r = await call(null, 'POST', '/auth/register', { email: 'real@test.io', password: 'password123', role: 'aupair', name: 'Real Person', country: 'PL' });
  const code = outbox.find((m) => m.to === 'real@test.io').text.match(/\b(\d{6})\b/)[1];
  await call(r.body.token, 'POST', '/auth/verify-email', { code });
  assert.equal((await call(r.body.token, 'GET', '/discover')).body.total, 0);
  assert.equal((await call(r.body.token, 'GET', '/search')).body.total, 0);
  const demoFamily = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_LOGINS.family).id;
  assert.equal((await call(r.body.token, 'GET', `/users/${demoFamily}`)).status, 404);
  assert.equal((await call(r.body.token, 'POST', '/swipe', { target_id: demoFamily, direction: 'like' })).status, 404);
  const t = await login(DEMO_LOGINS.family);
  assert.ok((await call(t, 'GET', '/discover')).body.results.every((x) => x.user.name !== 'Real Person'));
  // Forgot password on a demo login sends nothing.
  await call(null, 'POST', '/auth/forgot', { email: DEMO_LOGINS.aupair });
  assert.ok(!outbox.some((m) => String(m.to).endsWith('@demo.pairmundo.com')));
});

test('demo: logins are restored, and the demo world is rebuilt after a reviewer deletes an account', async () => {
  const t = await login(DEMO_LOGINS.aupair);
  assert.equal((await call(t, 'DELETE', '/me', { password: PASSWORD })).status, 200);
  const fam = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_LOGINS.family).id;
  db.prepare('UPDATE users SET suspended = 1 WHERE id = ?').run(fam);
  assert.equal(ensureDemoAccounts(db, { password: PASSWORD, uploadDir: process.env.UPLOAD_DIR }), 'built');
  for (const email of Object.values(DEMO_LOGINS)) await login(email);
  assert.equal(ensureDemoAccounts(db, { password: PASSWORD, uploadDir: process.env.UPLOAD_DIR }), 'ok');
  // The real member is untouched.
  assert.ok(db.prepare("SELECT 1 FROM users WHERE email = 'real@test.io'").get());
  assert.equal(ensureDemoAccounts(db, { password: '' }), 'off');
});
