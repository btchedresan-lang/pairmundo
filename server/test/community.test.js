import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

let server; let base; let db;
const mails = [];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.APPLY_RATE_LIMIT = '1000';
  process.env.NEARBY_HOST_ID = 'off';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-cm-');
  db = openDb(':memory:');
  const app = createApp(db, { mailer: async (m) => { mails.push(m); }, pusher: async (msgs) => msgs.map(() => ({ status: 'ok' })),
    moderator: async () => ({ verdict: 'allow', category: 'none', note: '' }) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); delete process.env.NEARBY_HOST_ID; });

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, type: res.headers.get('content-type') };
};
const login = async (email, password = 'password123') => (await call(null, 'POST', '/auth/login', { email, password })).body.token;
const insertUser = (cols) => Number(db.prepare(`INSERT INTO users (${Object.keys(cols).join(',')}) VALUES (${Object.keys(cols).map(() => '?').join(',')})`).run(...Object.values(cols)).lastInsertRowid);
const member = async (email, role, name, city = 'Stockholm') => {
  const id = insertUser({ email, password_hash: hashPassword('password123'), role, name, country: 'SE', city, email_verified: 1, photos: JSON.stringify(['/uploads/x.jpg']) });
  db.prepare(`INSERT INTO ${role === 'aupair' ? 'aupair_profiles' : 'family_profiles'} (user_id, bio) VALUES (?, ?)`).run(id, `Hi, I am ${name}.`);
  const token = await login(email);
  await call(token, 'PUT', '/me/nearby', { city, country: 'SE' });
  return { id, token };
};
const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const thisMonth = () => new Date().toISOString().slice(0, 7);

let adminT, cm, cmT;
test('the admin makes someone a Community Manager: their own account, a city, pay, and an invite email', async () => {
  insertUser({ email: 'admin@cm.io', password_hash: hashPassword('password123'), role: 'admin', name: 'Admin', email_verified: 1 });
  adminT = await login('admin@cm.io');
  // An au pair's account can't be the Community Manager's.
  await member('aupair-owner@cm.io', 'aupair', 'Already Aupair');
  const clash = await call(adminT, 'POST', '/admin/community/managers', { email: 'aupair-owner@cm.io', name: 'X', city: 'Stockholm', country: 'SE' });
  assert.equal(clash.status, 409);

  const r = await call(adminT, 'POST', '/admin/community/managers', { email: 'lina@cm.io', name: 'Lina Ek', city: 'Stockholm', country: 'SE', currency: 'SEK',
    retainer: '4000', trial_retainer: '3000', trial_until: '', event_fee: '1000', newcomer_fee: '100', family_pass_fee: '250', started_on: '2026-01-01' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.retainer, 400000);
  assert.equal(r.body.city_key, 'stockholm');
  cm = r.body.user_id;
  const u = db.prepare('SELECT role, email_verified FROM users WHERE id = ?').get(cm);
  assert.deepEqual({ ...u }, { role: 'ambassador', email_verified: 1 });
  const mail = mails.find((m) => m.to === 'lina@cm.io');
  assert.match(mail.subject, /Community Manager for Stockholm/);
  assert.match(mail.text, /\nBadji\nCo-founder & Partnerships, PairMundo$/);
  assert.match(mail.html, /community-meetups\.jpg/);
  // Their password is set through "Forgot password"; here, directly.
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword('password123'), cm);
  cmT = await login('lina@cm.io');
  const me = await call(cmT, 'GET', '/me');
  assert.deepEqual(me.body.community, { city: 'Stockholm', country: 'SE' });
  // Members can't open the page.
  const ap = await member('ap0@cm.io', 'aupair', 'Ap Zero');
  assert.equal((await call(ap.token, 'GET', '/community/me')).status, 403);
});

let meetupId, code;
const people = [];
test('a Community Manager hosts in their city, and everyone on Nearby there hears about it', async () => {
  for (let i = 1; i <= 6; i++) people.push(await member(`ap${i}@cm.io`, 'aupair', `Au Pair${i}`));
  people.push(await member('fam1@cm.io', 'family', 'Fam One'));
  const far = await member('far@cm.io', 'aupair', 'Far Away', 'Malmö');
  const r = await call(cmT, 'POST', '/meetups', { title: 'Saturday fika', kind: 'coffee', place: 'Café Pascal, Norrtullsgatan', starts_at: iso(30), audience: 'both', public_place: true, city: 'Göteborg', country: 'NO' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const m = r.body.meetup;
  assert.equal(m.source, 'community');
  assert.equal(m.city, 'Stockholm'); // always their own city
  assert.equal(m.community, true);
  assert.match(m.checkin.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(m.checkin.url, new RegExp(`/#/checkin/${m.id}/${m.checkin.code}$`));
  meetupId = m.id; code = m.checkin.code;
  const notified = db.prepare("SELECT user_id FROM notifications WHERE link = ?").all(`#/meetups/${m.id}`).map((x) => x.user_id);
  assert.ok(notified.includes(people[0].id) && notified.includes(people[6].id));
  assert.ok(!notified.includes(far.id));
  // Members see the host by first name, as PairMundo's, not as a profile.
  const seen = await call(people[0].token, 'GET', `/meetups/${m.id}`);
  assert.equal(seen.body.meetup.community_host, 'Lina E.');
  assert.equal(seen.body.meetup.host, null);
  assert.equal(seen.body.meetup.checkin, undefined);
  // The QR code is the host's.
  const qr = await call(cmT, 'GET', `/meetups/${m.id}/qr.svg`);
  assert.equal(qr.status, 200);
  assert.match(qr.type, /image\/svg\+xml/);
  assert.equal((await call(people[0].token, 'GET', `/meetups/${m.id}/qr.svg`)).status, 404);
});

test('check-in needs the right code, at the meetup time; the first one in the city counts as new', async () => {
  const [a, b] = people;
  // Too early: check-in opens 30 minutes before.
  const early = await call(a.token, 'POST', `/meetups/${meetupId}/checkin`, { code });
  assert.equal(early.status, 400);
  assert.equal(early.body.code, 'too_early');
  // Move it to now.
  db.prepare('UPDATE meetups SET starts_at = ? WHERE id = ?').run(iso(-0.5), meetupId);
  assert.equal((await call(a.token, 'POST', `/meetups/${meetupId}/checkin`, { code: 'WRONG1' })).body.code, 'bad_code');
  assert.equal((await call(cmT, 'POST', `/meetups/${meetupId}/checkin`, { code })).status, 403); // members only
  const ok = await call(a.token, 'POST', `/meetups/${meetupId}/checkin`, { code: code.toLowerCase() });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.meetup.checked_in, true);
  assert.equal(ok.body.meetup.i_am_going, true); // checking in also adds you to who's going
  // Twice is once.
  await call(a.token, 'POST', `/meetups/${meetupId}/checkin`, { code });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM meetup_checkins WHERE meetup_id = ?').get(meetupId).n, 1);
  assert.equal(db.prepare('SELECT newcomer FROM meetup_checkins WHERE user_id = ?').get(a.id).newcomer, 1);
  // Rating: only people who checked in.
  assert.equal((await call(b.token, 'POST', `/meetups/${meetupId}/rating`, { stars: 5 })).status, 403);
  assert.equal((await call(a.token, 'POST', `/meetups/${meetupId}/rating`, { stars: 9 })).status, 400);
  const rated = await call(a.token, 'POST', `/meetups/${meetupId}/rating`, { stars: 3, comment: 'Lovely' });
  assert.equal(rated.body.meetup.my_rating, 3);
  await call(a.token, 'POST', `/meetups/${meetupId}/rating`, { stars: 5, comment: 'Lovely, really' }); // changing your mind replaces it
  assert.equal(db.prepare('SELECT stars FROM meetup_ratings WHERE user_id = ?').get(a.id).stars, 5);
  // The host sees the count.
  const host = await call(cmT, 'GET', `/meetups/${meetupId}`);
  assert.equal(host.body.meetup.checkin.count, 1);
  assert.equal(host.body.meetup.checkin.newcomers, 1);
});

test('an event is scored on check-ins, newcomers and ratings once ratings close, and pays the month', async () => {
  // A second meetup, where people who came before are no longer new.
  for (const p of people.slice(1)) {
    const r = await call(p.token, 'POST', `/meetups/${meetupId}/checkin`, { code });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  for (const [i, p] of people.slice(1, 4).entries()) await call(p.token, 'POST', `/meetups/${meetupId}/rating`, { stars: [4, 5, 4][i] });
  // While ratings are open, it is still being scored.
  let me = (await call(cmT, 'GET', '/community/me')).body;
  const ev = me.events.find((e) => e.id === meetupId);
  assert.equal(ev.status, 'scoring');
  assert.equal(ev.checkins, 7);
  assert.equal(ev.newcomers, 7);
  assert.equal(ev.comments[0].comment, 'Lovely, really');
  assert.equal(me.this_month.final, false);

  // A cancelled one and a quiet one, later the same month.
  const quiet = (await call(cmT, 'POST', '/meetups', { title: 'Picnic', kind: 'picnic', place: 'Humlegården', starts_at: iso(48), public_place: true })).body.meetup;
  db.prepare('UPDATE meetups SET starts_at = ? WHERE id = ?').run(iso(-0.5), quiet.id);
  const again = await call(people[0].token, 'POST', `/meetups/${quiet.id}/checkin`, { code: quiet.checkin.code });
  assert.equal(again.status, 200);
  assert.equal(db.prepare('SELECT newcomer FROM meetup_checkins WHERE meetup_id = ? AND user_id = ?').get(quiet.id, people[0].id).newcomer, 0);

  // Ratings close 3 days after the start: move both meetups back 4 days, inside this month or the last.
  const back = new Date(Date.now() - 4 * 86400e3).toISOString();
  db.prepare('UPDATE meetups SET starts_at = ? WHERE id IN (?, ?)').run(back, meetupId, quiet.id);
  const month = back.slice(0, 7);
  const admin = (await call(adminT, 'GET', `/admin/community?month=${month}`)).body;
  const s = admin.managers.find((m) => m.user_id === cm).summary;
  const scored = Object.fromEntries(s.events.map((e) => [e.id, e]));
  assert.equal(scored[meetupId].status, 'success', JSON.stringify(scored[meetupId]));
  assert.equal(scored[meetupId].rating, 4.5);
  assert.equal(scored[quiet.id].status, 'not_met');
  assert.deepEqual(scored[quiet.id].misses, ['1 of 5 check-ins', '0 of 2 newcomers', '0 of 3 ratings']);
  // Two held (each with a check-in) meets the minimum of 2, so the retainer is earned; one successful event with 7 newcomers.
  assert.equal(s.lines.retainer.held, 2);
  assert.equal(s.lines.retainer.amount, 400000);
  assert.equal(s.lines.events.amount, 100000);
  assert.equal(s.lines.newcomers.count, 7);
  assert.equal(s.lines.newcomers.amount, 70000);
  assert.equal(s.total, 400000 + 100000 + 70000);

  // A trial month pays the trial retainer; the rules can be changed.
  await call(adminT, 'PUT', `/admin/community/managers/${cm}`, { trial_until: `${month}-28` });
  let s2 = (await call(adminT, 'GET', `/admin/community?month=${month}`)).body.managers[0].summary;
  assert.equal(s2.lines.retainer.amount, 300000);
  await call(adminT, 'PUT', `/admin/community/managers/${cm}`, { trial_until: '' });
  const rules = await call(adminT, 'PUT', '/admin/community/rules', { min_checkins: 10 });
  assert.equal(rules.body.min_checkins, 10);
  s2 = (await call(adminT, 'GET', `/admin/community?month=${month}`)).body.managers[0].summary;
  assert.equal(s2.lines.events.successful, 0);
  await call(adminT, 'PUT', '/admin/community/rules', { min_checkins: 5 });
  assert.equal((await call(adminT, 'PUT', '/admin/community/rules', { min_rating: 7 })).status, 400);
});

test('a family who checks in and then buys a Family Pass earns the bonus, in the month they buy', async () => {
  const fam = people[6];
  const first = db.prepare('SELECT created_at FROM meetup_checkins WHERE user_id = ?').get(fam.id).created_at;
  // A free trial pass doesn't count; a paid one within 60 days does.
  db.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?, 'trial', 't1', datetime('now'), datetime('now', '+7 days'))").run(fam.id);
  db.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at, created_at) VALUES (?, 'stripe', 's1', datetime('now'), datetime('now', '+90 days'), datetime(?, '+1 day'))").run(fam.id, first);
  const month = new Date(Date.parse(`${first.replace(' ', 'T')}Z`) + 86400e3).toISOString().slice(0, 7);
  const s = (await call(adminT, 'GET', `/admin/community?month=${month}`)).body.managers[0].summary;
  assert.equal(s.lines.family_passes.count, 1);
  assert.equal(s.lines.family_passes.amount, 25000);
});

test('a finished month is marked paid once, with its breakdown, and goes on the payout sheet', async () => {
  // This month isn't over yet.
  const now = await call(adminT, 'POST', `/admin/community/managers/${cm}/paid`, { month: thisMonth() });
  assert.equal(now.status, 400);
  // Make every event a month older, and pay that month.
  db.prepare("UPDATE meetups SET starts_at = ? WHERE source = 'community'").run(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 10, 12)).toISOString());
  const last = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const paid = await call(adminT, 'POST', `/admin/community/managers/${cm}/paid`, { month: last });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.ok(paid.body.paid.amount >= 570000);
  assert.equal((await call(adminT, 'POST', `/admin/community/managers/${cm}/paid`, { month: last })).status, 409);
  const row = db.prepare('SELECT * FROM community_payouts WHERE user_id = ?').get(cm);
  assert.equal(JSON.parse(row.breakdown).events.length, 2);
  const csv = await call(adminT, 'GET', `/admin/community.csv?month=${last}`);
  assert.match(csv.body, /^name,email,city/);
  assert.match(csv.body, /Lina Ek,lina@cm\.io,Stockholm,SE,SEK,2,2,4000\.00/);
  // The manager sees what was paid.
  const me = (await call(cmT, 'GET', '/community/me')).body;
  assert.equal(me.payouts[0].month, last);
  // Pausing them stops their hosting.
  await call(adminT, 'PUT', `/admin/community/managers/${cm}`, { active: false });
  assert.equal((await call(cmT, 'POST', '/meetups', { title: 'Walk', kind: 'walk', place: 'Djurgården', starts_at: iso(30), public_place: true })).status, 403);
});

test('the Community Manager job is on the careers page in six cities, and hiring opens the Community form', async () => {
  const jobs = (await call(null, 'GET', '/jobs')).body.jobs;
  const job = jobs.find((j) => j.slug === 'community-manager');
  assert.deepEqual(job.locations.map((l) => l.city), ['Stockholm', 'Bogotá', 'São Paulo', 'Mexico City', 'Cape Town', 'Manila']);
  const page = (await call(null, 'GET', '/jobs/community-manager')).body;
  assert.equal(page.pay, undefined); // the private pay stays private
  const apply = { name: 'Camila Ruiz', email: 'camila@cm.io', phone: '+57 300', campaign_answer: 'I was an au pair in Germany for a year.', objection_answer: 'A welcome coffee, a picnic and a visa Q&A.' };
  assert.equal((await call(null, 'POST', '/jobs/community-manager/apply', { ...apply, location: 'Lima, PE' })).status, 400);
  const ok = await call(null, 'POST', '/jobs/community-manager/apply', { ...apply, location: 'Bogotá, CO' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const a = db.prepare("SELECT * FROM job_applications WHERE email = 'camila@cm.io'").get();
  assert.equal(a.country, 'CO');
  assert.equal(a.location, 'Bogotá');
  const hired = await call(adminT, 'POST', `/pipeline/applicants/${a.id}/hire`, {});
  assert.equal(hired.status, 200);
  assert.match(hired.body.next, /^#\/admin\/community\?new=1&name=Camila\+Ruiz&email=camila%40cm\.io&country=CO&city=Bogot%C3%A1$/);
});
