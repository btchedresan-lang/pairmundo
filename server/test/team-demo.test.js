import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { ensureDemoAccounts, ensureTeamDemo, DEMO_LOGINS, TEAM_LOGINS, TEAM_AGENCY } from '../server/demo.js';

const REVIEW = 'Review-2026!';
const TEAM = 'Team-2026!';
let server; let base; let db; let uploadDir;
const outbox = [];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.FAMILY_PASS = 'on';
  uploadDir = mkdtempSync(`${tmpdir()}/aupair-team-`);
  process.env.UPLOAD_DIR = uploadDir;
  db = openDb(':memory:');
  assert.equal(ensureDemoAccounts(db, { password: REVIEW, uploadDir }), 'built');
  assert.equal(ensureTeamDemo(db, { password: TEAM, uploadDir }), 'built');
  db.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('admin-password-1'));
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
const login = async (email, password = TEAM) => {
  const r = await call(null, 'POST', '/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
};

test('team demo: the agency sees its Closed Loop, families, invites, introductions and a flag', async () => {
  const t = await login(TEAM_LOGINS.agency);
  const amb = (await call(t, 'GET', '/me/ambassador')).body;
  assert.equal(amb.kind, 'agency');
  assert.equal(amb.code, TEAM_AGENCY.code);
  assert.equal(amb.space.loop, true);
  assert.equal(amb.total.aupairs, 5);
  assert.equal(amb.total.profiles, 4);
  assert.equal(amb.introductions.length, 2);
  assert.equal(amb.flags.length, 1);
  const { families } = (await call(t, 'GET', '/agency/families')).body;
  assert.equal(families.length, 3);
  const berg = families.find((f) => f.name === 'Familjen Berg');
  assert.equal(berg.stage, 'enquiry');
  assert.equal((await call(t, 'POST', `/agency/families/${berg.id}`, { stage: 'approved' })).body.stage, 'approved');
  assert.equal((await call(t, 'GET', '/agency/family-invites')).body.invites.length, 2);
  // Invitations from the training agency are listed but never emailed.
  const sent = outbox.length;
  assert.equal((await call(t, 'POST', '/agency/family-invites', { email: 'someone@example.com', role: 'aupair' })).body.invited, true);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(outbox.length, sent);
  // The agency's criteria can be opened up to the whole (demo) app.
  assert.equal((await call(t, 'POST', '/agency/criteria', { criteria: null })).status, 200);
  await call(t, 'POST', '/agency/criteria', { criteria: { only_own: true } });
  // The app review logins don't work with the team password.
  assert.equal((await call(null, 'POST', '/auth/login', { email: DEMO_LOGINS.family, password: TEAM })).status, 401);
});

test('team demo: the family and the au pair work inside the agency space, with contact details hidden', async () => {
  const f = await login(TEAM_LOGINS.family);
  const deck = (await call(f, 'GET', '/discover')).body;
  assert.ok(deck.results.length >= 1);
  const agencyAupairs = new Set(db.prepare('SELECT id FROM users WHERE ref_code = ?').all(TEAM_AGENCY.code).map((r) => r.id));
  assert.ok(deck.results.every((r) => agencyAupairs.has(r.user.id)), 'only the agency\'s own au pairs');
  assert.equal((await call(f, 'GET', '/likes')).body.likes.length, 2);
  const [c] = (await call(f, 'GET', '/conversations')).body.conversations;
  const m = await call(f, 'POST', `/conversations/${c.id}/messages`, { body: 'Call me on +46 70 123 45 67' });
  assert.ok([200, 201].includes(m.status), JSON.stringify(m.body));
  assert.ok(!JSON.stringify(m.body).includes('123 45 67'));

  const a = await login(TEAM_LOGINS.aupair);
  const pl = (await call(a, 'GET', '/placements')).body.placements;
  assert.equal(pl.length, 1);
  assert.equal(pl[0].status, 'proposed');
  assert.equal((await call(a, 'GET', '/conversations')).body.conversations.length, 1);
  // The app review family never sees the agency's au pairs.
  const r = await login(DEMO_LOGINS.family, REVIEW);
  assert.ok((await call(r, 'GET', '/discover')).body.results.every((x) => !agencyAupairs.has(x.user.id)));
});

test('team demo: the training agency stays out of real agency lists and its code can\'t be used to sign up', async () => {
  const adm = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'admin-password-1' })).body.token;
  assert.ok(!(await call(adm, 'GET', '/admin/agency-race')).body.recipients.some((x) => x.code === TEAM_AGENCY.code));
  assert.ok(!(await call(adm, 'GET', '/admin/agency-announce')).body.agencies.some((x) => x.code === TEAM_AGENCY.code));
  assert.ok(!(await call(adm, 'GET', '/admin/agency-update')).body.recipients.some((x) => x.code === TEAM_AGENCY.code));
  const r = await call(null, 'POST', '/auth/register', { email: 'real@test.io', password: 'password123', role: 'aupair', name: 'Real Person', country: 'PH', ref_code: TEAM_AGENCY.code });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.ok(!db.prepare("SELECT 1 FROM users WHERE email = 'real@test.io'").get());
});

test('team demo: logins are restored and the world is rebuilt, also after the app review world is rebuilt', async () => {
  const id = db.prepare('SELECT id FROM users WHERE email = ?').get(TEAM_LOGINS.family).id;
  db.prepare("UPDATE users SET password_hash = 'x', suspended = 1 WHERE id = ?").run(id);
  assert.equal(ensureTeamDemo(db, { password: TEAM, uploadDir }), 'ok');
  await login(TEAM_LOGINS.family);
  const t = await login(DEMO_LOGINS.aupair, REVIEW);
  assert.equal((await call(t, 'DELETE', '/me', { password: REVIEW })).status, 200);
  assert.equal(ensureDemoAccounts(db, { password: REVIEW, uploadDir }), 'built');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ambassadors WHERE demo = 1').get().n, 0);
  assert.equal(ensureTeamDemo(db, { password: TEAM, uploadDir }), 'built');
  for (const email of Object.values(TEAM_LOGINS)) await login(email);
  assert.equal(ensureTeamDemo(db, { password: '' }), 'off');
});
