import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { GUIDE_TEXT } from '../server/guide.js';

let server; let base; let db;
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-guide-');
  db = openDb(':memory:');
  const app = createApp(db, { mailer: async () => {}, pusher: async (m) => m.map(() => ({ status: 'ok' })), identity: { start: async () => ({}), status: async () => ({}) },
    moderator: async () => ({ verdict: 'allow', category: 'none', note: '' }) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = async (token, method, path, body, lang) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(lang ? { 'Accept-Language': lang } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: 'password123' })).body.token;
const user = (email, role, name, country, extra = {}) => {
  const cols = { email, password_hash: hashPassword('password123'), role, name, country, email_verified: 1, ...extra };
  const id = Number(db.prepare(`INSERT INTO users (${Object.keys(cols).join(',')}) VALUES (${Object.keys(cols).map(() => '?').join(',')})`).run(...Object.values(cols)).lastInsertRowid);
  if (role === 'aupair') db.prepare('INSERT INTO aupair_profiles (user_id) VALUES (?)').run(id);
  if (role === 'family') db.prepare('INSERT INTO family_profiles (user_id) VALUES (?)').run(id);
  return id;
};
const ready = (id, table) => {
  db.prepare("UPDATE users SET photos = '[\"/media/x.jpg\"]' WHERE id = ?").run(id);
  db.prepare(`UPDATE ${table} SET bio = 'Hello there' WHERE user_id = ?`).run(id);
};
const stepsOf = (g) => Object.fromEntries(g.steps.map((s) => [s.key, s.done]));

test('guide: every text has all six languages', () => {
  for (const [key, row] of Object.entries(GUIDE_TEXT)) {
    assert.equal(row.length, 6, `${key} needs en, es, fr, de, pt and sv`);
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    for (const s of row) assert.equal(vars(s), vars(row[0]), `${key}: placeholders differ in "${s}"`);
  }
});

test('guide: an au pair and a family move through their steps, and the app gets the next one as a card', async () => {
  const ap = user('ap@test.io', 'aupair', 'Maria Lopez', 'ES', { email_verified: 0 });
  const fam = user('fam@test.io', 'family', 'Anna Svensson', 'SE');
  const apT = await login('ap@test.io'); const famT = await login('fam@test.io');

  let g = (await call(apT, 'GET', '/guide')).body.guide;
  assert.equal(g.kind, 'aupair');
  assert.deepEqual(g.steps.map((s) => s.key), ['email', 'profile', 'id', 'swipe', 'match', 'chat', 'call', 'placement']);
  assert.equal(g.next, 'email');
  assert.equal(g.tour_seen, false);
  assert.ok(g.tour.length >= 4);
  // The app already nudges for email and profile, so no next-step card yet; the website never gets it in /news.
  assert.equal((await call(apT, 'GET', '/news')).body.news, null);

  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(ap);
  ready(ap, 'aupair_profiles'); ready(fam, 'family_profiles');
  g = (await call(apT, 'GET', '/guide')).body.guide;
  assert.equal(g.next, 'id');
  let news = (await call(apT, 'GET', '/news')).body.news;
  assert.equal(news.id, 'step-id');
  assert.equal(news.link, '#/account');
  assert.match(news.title, /Verify your ID/);
  assert.match(news.text, /2 of 8 done/);
  assert.equal((await call(apT, 'GET', '/news?guide=0')).body.news, null);

  // Closing the card keeps that step away for a few days and every other one for the rest of the day.
  assert.equal((await call(apT, 'POST', '/news/step-id/seen')).status, 200);
  assert.equal((await call(apT, 'GET', '/news')).body.news, null);
  db.prepare("UPDATE guide_state SET snooze = json_set(snooze, '$._all', '2000-01-01T00:00:00Z') WHERE user_id = ?").run(ap);
  news = (await call(apT, 'GET', '/news')).body.news;
  assert.equal(news.id, 'step-swipe', 'the snoozed ID step is skipped');

  // Swipe, match, chat, call and placement are worked out from what really happened.
  await call(apT, 'POST', '/swipe', { target_id: fam, direction: 'like' });
  assert.equal(stepsOf((await call(apT, 'GET', '/guide')).body.guide).swipe, true);
  const m = await call(famT, 'POST', '/swipe', { target_id: ap, direction: 'like' });
  assert.ok(m.body.matched);
  g = (await call(famT, 'GET', '/guide')).body.guide;
  assert.equal(g.kind, 'family');
  assert.deepEqual(stepsOf(g), { email: true, profile: true, id: false, swipe: true, match: true, chat: false, call: false, placement: false });
  assert.equal(g.steps.find((s) => s.key === 'chat').link, `#/messages/${m.body.conversation_id}`);
  await call(apT, 'POST', `/conversations/${m.body.conversation_id}/messages`, { body: 'Hi Anna!' });
  await call(apT, 'POST', `/conversations/${m.body.conversation_id}/calls`);
  assert.deepEqual([stepsOf((await call(apT, 'GET', '/guide')).body.guide).chat, stepsOf((await call(famT, 'GET', '/guide')).body.guide).chat], [true, false],
    'saying hi counts for the one who wrote');
  assert.equal(stepsOf((await call(famT, 'GET', '/guide')).body.guide).call, true, 'a call counts for both');
  db.prepare("INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money, created_by) VALUES (?, ?, 'SE', '2027-01-10', '2027-12-10', 25, 4000, ?)").run(ap, fam, fam);
  db.prepare('UPDATE users SET id_verified = 1 WHERE id = ?').run(ap);
  g = (await call(apT, 'GET', '/guide')).body.guide;
  assert.equal(g.complete, true);
  assert.equal((await call(apT, 'GET', '/news')).body.news, null);

  // The walkthrough is shown once; the card can be hidden and brought back.
  await call(apT, 'POST', '/guide/tour-seen');
  assert.equal((await call(apT, 'GET', '/guide')).body.guide.tour_seen, true);
  await call(famT, 'PUT', '/guide/hidden', { hidden: true });
  assert.equal((await call(famT, 'GET', '/guide')).body.guide.hidden, true);
  assert.equal((await call(famT, 'GET', '/news')).body.news, null, 'a hidden guide sends no card either');
  await call(famT, 'PUT', '/guide/hidden', { hidden: false });
  assert.equal((await call(famT, 'GET', '/news')).body.news.id, 'step-id');

  // An admin message still comes first.
  const admin = user('admin@test.io', 'admin', 'Admin', 'SE');
  assert.ok(admin);
  await call(await login('admin@test.io'), 'POST', '/admin/messages', { text: 'Welcome to launch day!', audience: { people: 'fam@test.io' } });
  assert.match((await call(famT, 'GET', '/news')).body.news.text, /launch day/);
});

test('guide: text follows the language, and families who need the Family Pass get that step', async () => {
  process.env.FAMILY_PASS = 'on';
  try {
    const fam = user('fam2@test.io', 'family', 'Bo Berg', 'SE', { lang: 'sv' });
    ready(fam, 'family_profiles');
    const t = await login('fam2@test.io');
    const g = (await call(t, 'GET', '/guide', null, 'de-DE')).body.guide;
    assert.ok(g.steps.some((s) => s.key === 'pass' && s.link === '#/family-pass'));
    assert.equal(g.steps.find((s) => s.key === 'swipe').title, 'Like Profile unter Entdecken');
    assert.ok(g.tour.some((s) => /Family Pass/.test(s.text)));
  } finally { delete process.env.FAMILY_PASS; }
});

test('guide: agencies and Community Managers get their own steps; admins get none', async () => {
  const ag = user('agency@test.io', 'agency', 'Nordic Au Pairs', 'SE');
  let t = await login('agency@test.io');
  let g = (await call(t, 'GET', '/guide')).body.guide;
  assert.equal(g.kind, 'agency');
  assert.equal(g.next, 'code', 'waiting for PairMundo to set up the code');
  assert.equal(g.steps.find((s) => s.key === 'code').cta, null);
  db.prepare("INSERT INTO ambassadors (code, name, kind, user_id) VALUES ('NORDIC', 'Nordic Au Pairs', 'agency', ?)").run(ag);
  const ap = user('ap3@test.io', 'aupair', 'Lea Ma', 'FR', { ref_code: 'NORDIC' });
  g = (await call(t, 'GET', '/guide')).body.guide;
  assert.deepEqual(stepsOf(g), { email: true, code: true, share: true, ap_joined: true, visible: false, fam_joined: false, ag_placement: false });
  ready(ap, 'aupair_profiles');
  assert.equal(stepsOf((await call(t, 'GET', '/guide')).body.guide).visible, true);
  assert.equal((await call(t, 'GET', '/news')).body.news, null, 'agencies have the card on their own page');

  const cm = user('cm@test.io', 'ambassador', 'Sara Community', 'SE');
  db.prepare("INSERT INTO community_managers (user_id, city, city_key, country, started_on) VALUES (?, 'Stockholm', 'stockholm', 'SE', '2026-11-01')").run(cm);
  t = await login('cm@test.io');
  g = (await call(t, 'GET', '/guide')).body.guide;
  assert.equal(g.kind, 'community');
  assert.deepEqual(g.steps.map((s) => s.key), ['email', 'meetup', 'checkin', 'rating']);
  assert.match(g.tour[0].text, /Stockholm/);

  user('plain@test.io', 'ambassador', 'Just An Ambassador', 'SE');
  assert.equal((await call(await login('plain@test.io'), 'GET', '/guide')).body.guide, null);
});
