// Admin numbers count real members only: demo accounts, team test accounts and suspended accounts are left out,
// and members are split into signed up, confirmed email and complete profile.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

let server; let base; let db;
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.NEARBY_HOST_ID = 'off';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-counts-');
  db = openDb(':memory:');
  const app = createApp(db, { mailer: async () => {}, pusher: async (m) => m.map(() => ({ status: 'ok' })), moderator: async () => ({ verdict: 'allow', category: 'none', note: '' }) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); delete process.env.NEARBY_HOST_ID; });

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const insertUser = (cols) => Number(db.prepare(`INSERT INTO users (${Object.keys(cols).join(',')}) VALUES (${Object.keys(cols).map(() => '?').join(',')})`).run(...Object.values(cols)).lastInsertRowid);
let n = 0;
const person = (role, { verified = 1, photo = true, bio = true, ...extra } = {}) => {
  const id = insertUser({ email: `p${++n}@counts.io`, password_hash: 'x', role, name: `Person ${n}`, country: 'SE', email_verified: verified,
    photos: JSON.stringify(photo ? ['/uploads/x.jpg'] : []), ...extra });
  db.prepare(`INSERT INTO ${role === 'aupair' ? 'aupair_profiles' : 'family_profiles'} (user_id, bio) VALUES (?, ?)`).run(id, bio ? 'Hello' : null);
  return id;
};

test('the overview splits real members by stage and leaves out demo, test and suspended accounts', async () => {
  insertUser({ email: 'admin@counts.io', password_hash: hashPassword('password123'), role: 'admin', name: 'Admin', email_verified: 1 });
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@counts.io', password: 'password123' })).body.token;
  person('aupair'); // complete
  person('aupair', { bio: false }); // confirmed, no bio
  person('aupair', { verified: 0 }); // never confirmed
  person('aupair', { suspended: 1 });
  person('aupair', { demo: 1 });
  const staff = person('aupair');
  const fam = person('family');
  person('family', { photo: false });
  // A placement with a demo account doesn't count.
  const demoFam = person('family', { demo: 1 });
  db.prepare("INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money, status, created_by) VALUES (?,?,'SE','2026-01-01','2026-12-31',30,4000,'active',?)").run(staff, demoFam, staff);

  let s = (await call(admin, 'GET', '/admin/stats')).body;
  assert.deepEqual(s.aupairs, { signed_up: 4, confirmed: 3, complete: 2 });
  assert.deepEqual(s.families, { signed_up: 2, confirmed: 2, complete: 1 });
  assert.deepEqual(s.left_out, { suspended: 1, test: 0, demo: 2 });
  assert.equal(s.placements_active, 0);
  assert.deepEqual(s.by_country.find((r) => r.role === 'aupair'), { country: 'SE', role: 'aupair', signed_up: 4, confirmed: 3, complete: 2 });

  // The admin marks a staff sign-up as a test account: it keeps working, but no number counts it, and nobody is notified.
  const before = db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ?').get(staff).n;
  const r = await call(admin, 'POST', `/admin/users/${staff}`, { test_account: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.test_account, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ?').get(staff).n, before);
  s = (await call(admin, 'GET', '/admin/stats')).body;
  assert.deepEqual(s.aupairs, { signed_up: 3, confirmed: 2, complete: 1 });
  assert.equal(s.left_out.test, 1);

  // The users list labels them, and hides demo accounts unless asked.
  let list = (await call(admin, 'GET', '/admin/users')).body;
  assert.equal(list.users.find((u) => u.id === staff).test_account, true);
  assert.ok(!list.users.some((u) => u.demo));
  assert.equal(list.demo_hidden, 2);
  list = (await call(admin, 'GET', '/admin/users?demo=1')).body;
  assert.equal(list.users.filter((u) => u.demo).length, 2);
  assert.equal(list.demo_hidden, 0);
  assert.ok(fam);
});

test('agency and ambassador counts leave out suspended, demo and test accounts', async () => {
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@counts.io', password: 'password123' })).body.token;
  const a = (await call(admin, 'POST', '/admin/ambassadors', { code: 'COUNTME', name: 'Count Agency', kind: 'agency' })).body;
  person('aupair', { ref_code: 'COUNTME' });
  person('aupair', { ref_code: 'COUNTME', suspended: 1 });
  person('aupair', { ref_code: 'COUNTME', test_account: 1 });
  person('family', { ref_code: 'COUNTME', demo: 1 });
  const got = (await call(admin, 'GET', `/admin/ambassadors/${a.id}`)).body.stats;
  assert.equal(got.aupairs, 1);
  assert.equal(got.families, 0);
  assert.equal(got.profiles, 1);
});
