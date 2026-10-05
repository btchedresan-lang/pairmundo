import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { scoreMatch, checkCompliance } from '../server/matching.js';
import { PROGRAMS } from '../server/programs.js';

let server; let base;
const outbox = [];
const lastCode = (to) => [...outbox].reverse().find((m) => m.to === to)?.text.match(/\b(\d{6})\b/)[1];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-test-');
  const app = createApp(openDb(':memory:'), { mailer: async (m) => { outbox.push(m); } });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};
const register = async (email, role, country, name = email) => {
  const r = await call(null, 'POST', '/auth/register', { email, password: 'password123', role, name, country });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const v = await call(r.body.token, 'POST', '/auth/verify-email', { code: lastCode(email) });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: r.body.token, id: r.body.user.id };
};

test('end-to-end: register, match, message, placement, compliance, two-way reviews', async () => {
  const fam = await register('fam@test.io', 'family', 'DE', 'Familie Test');
  const ap = await register('ap@test.io', 'aupair', 'PL', 'Ola Test');

  // Duplicate email rejected, bad password rejected
  assert.equal((await call(null, 'POST', '/auth/register', { email: 'FAM@test.io', password: 'password123', role: 'family', name: 'x' })).status, 409);
  assert.equal((await call(null, 'POST', '/auth/login', { email: 'fam@test.io', password: 'nope' })).status, 401);

  // Profiles
  let r = await call(fam.token, 'PUT', '/me', { city: 'Berlin', profile: { children: [{ age: 3 }], languages: ['de'], required_languages: ['de'], start_date: '2027-01-01', duration_months: 12, weekly_hours: 30, pocket_money: 280 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.profile.required_languages, ['de']);
  r = await call(ap.token, 'PUT', '/me', { profile: { birth_date: '2003-05-05', nationality: 'PL', languages: [{ code: 'de', level: 'B1' }], preferred_countries: ['DE'], age_groups: ['toddler'], childcare_years: 3, available_from: '2027-01-01', duration_months: 12 } });
  assert.equal(r.status, 200);
  assert.equal((await call(ap.token, 'PUT', '/me', { profile: { birth_date: 'yesterday' } })).status, 400);

  // Search with match score
  r = await call(fam.token, 'GET', '/search');
  assert.equal(r.body.total, 1);
  assert.ok(r.body.results[0].match.score >= 80, `score ${r.body.results[0].match.score}`);
  assert.equal((await call(fam.token, 'GET', '/search?language=fr')).body.total, 0);

  // Messaging is blocked until a request is accepted
  assert.equal((await call(fam.token, 'POST', '/conversations', { user_id: ap.id })).status, 403);
  r = await call(fam.token, 'POST', '/requests', { to_user: ap.id, message: 'Hallo!' });
  assert.equal(r.status, 201);
  assert.equal((await call(fam.token, 'POST', '/requests', { to_user: ap.id })).status, 409);
  assert.equal((await call(fam.token, 'POST', `/requests/${r.body.id}/respond`, { action: 'accept' })).status, 403);
  assert.equal((await call(ap.token, 'GET', '/me')).body.counts.requests, 1);
  assert.equal((await call(ap.token, 'POST', `/requests/${r.body.id}/respond`, { action: 'accept' })).status, 200);

  const conv = (await call(ap.token, 'POST', '/conversations', { user_id: fam.id })).body.id;
  let msgs = (await call(ap.token, 'GET', `/conversations/${conv}/messages`)).body.messages;
  assert.equal(msgs[0].body, 'Hallo!');
  await call(ap.token, 'POST', `/conversations/${conv}/messages`, { body: 'Hi there' });
  assert.equal((await call(fam.token, 'GET', '/me')).body.counts.messages, 1);

  // Placement violating German rules (40h/week, low pocket money) is refused
  r = await call(fam.token, 'POST', '/placements', { other_user_id: ap.id, start_date: '2027-01-01', end_date: '2027-12-31', weekly_hours: 40, pocket_money: 100 });
  assert.equal(r.status, 422);
  assert.equal(r.body.compliance.issues.filter((i) => i.level === 'error').length, 2);

  r = await call(fam.token, 'POST', '/placements', { other_user_id: ap.id, start_date: '2027-01-01', end_date: '2027-12-31', weekly_hours: 30, pocket_money: 280 });
  assert.equal(r.status, 201);
  const pid = r.body.id;
  let p = (await call(ap.token, 'GET', `/placements/${pid}`)).body;
  assert.equal(p.status, 'proposed');
  assert.equal(p.tasks.length, 10);
  assert.equal(p.can_review, false);
  assert.equal((await call(ap.token, 'POST', `/placements/${pid}/review`, { overall: 5 })).status, 400);

  p = (await call(ap.token, 'POST', `/placements/${pid}/confirm`)).body;
  assert.equal(p.status, 'confirmed');
  await call(fam.token, 'PATCH', `/placements/${pid}/tasks/${p.tasks[0].id}`, { done: true });
  await call(fam.token, 'POST', `/placements/${pid}/status`, { status: 'active' });
  assert.equal((await call(fam.token, 'POST', `/placements/${pid}/status`, { status: 'proposed' })).status, 400);

  // Double-blind reviews: hidden until both have reviewed
  assert.equal((await call(fam.token, 'POST', `/placements/${pid}/review`, { overall: 5, criteria: { reliability: 5, childcare: 4 }, comment: 'Great' })).status, 201);
  assert.equal((await call(fam.token, 'POST', `/placements/${pid}/review`, { overall: 4 })).status, 409);
  assert.equal((await call(fam.token, 'POST', `/placements/${pid}/review`, { overall: 9 })).status, 400);
  let prof = (await call(fam.token, 'GET', `/users/${ap.id}`)).body;
  assert.equal(prof.rating.count, 0);
  assert.equal((await call(ap.token, 'POST', `/placements/${pid}/review`, { overall: 4, criteria: { respect: 4 }, comment: 'Kind family' })).status, 201);
  prof = (await call(fam.token, 'GET', `/users/${ap.id}`)).body;
  assert.equal(prof.rating.avg, 5);
  assert.equal(prof.rating.criteria.childcare, 4);
  assert.equal((await call(fam.token, 'GET', `/users/${fam.id}`)).body.rating.avg, 4);

  // Reviewee may respond once
  const rid = prof.reviews[0].id;
  assert.equal((await call(ap.token, 'POST', `/reviews/${rid}/response`, { response: 'Thanks!' })).status, 200);
  assert.equal((await call(fam.token, 'POST', `/reviews/${rid}/response`, { response: 'Me too' })).status, 404);

  // Reports & privacy
  assert.equal((await call(ap.token, 'POST', '/reports', { review_id: rid, reason: 'test' })).status, 201);
  const stranger = await register('x@test.io', 'aupair', 'FR');
  assert.equal((await call(stranger.token, 'GET', `/placements/${pid}`)).status, 404);
  assert.equal((await call(stranger.token, 'GET', `/conversations/${conv}/messages`)).status, 404);
  assert.equal((await call(stranger.token, 'GET', '/admin/stats')).status, 403);
});

test('programs are public and admin-only to edit', async () => {
  const r = await call(null, 'GET', '/programs');
  assert.equal(r.body.programs.length, PROGRAMS.length);
  assert.equal((await call(null, 'GET', '/programs/us')).body.max_weekly_hours, 45);
  const fam = await register('fam2@test.io', 'family', 'US');
  assert.equal((await call(fam.token, 'PUT', '/programs/US', { max_weekly_hours: 60 })).status, 403);
});

test('match scoring and compliance rules', () => {
  const de = { ...PROGRAMS.find((p) => p.code === 'DE') };
  const ap = { user: { id: 1, country: 'BR' }, profile: { birth_date: '1990-01-01', languages: [{ code: 'de' }], preferred_countries: [], age_groups: [], childcare_years: 1 } };
  const fam = { user: { id: 2, country: 'DE' }, profile: { required_languages: ['de'], children: [{ age: 1 }], start_date: '2027-01-01' } };
  const m = scoreMatch(ap, fam, de);
  assert.ok(m.score <= 30, 'over-age candidate is capped');
  assert.ok(m.warnings.some((w) => w.includes('outside')));
  assert.ok(m.warnings.some((w) => w.includes('infant')));
  const ok = checkCompliance(de, { birth_date: '2004-01-01', start_date: '2027-01-01', end_date: '2027-12-31', weekly_hours: 30, pocket_money: 280 });
  assert.equal(ok.ok, true);
  const tooLong = checkCompliance(de, { birth_date: '2004-01-01', start_date: '2027-01-01', end_date: '2029-01-01', weekly_hours: 30, pocket_money: 280 });
  assert.equal(tooLong.ok, false);
});

test('swiping: mutual like makes a match, pass hides, undo restores, photos upload', async () => {
  const fam = await register('swipefam@test.io', 'family', 'US', 'Swipe Family');
  const ap = await register('swipeap@test.io', 'aupair', 'BR', 'Swipe Aupair');
  const ap2 = await register('swipeap2@test.io', 'aupair', 'MX', 'Second Aupair');

  let deck = (await call(fam.token, 'GET', '/discover')).body.results.map((r) => r.user.id);
  assert.ok(deck.includes(ap.id) && deck.includes(ap2.id));

  // Family likes au pair: no match yet, au pair sees it in Likes and the card is flagged
  let r = await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' });
  assert.equal(r.body.matched, false);
  assert.ok(!(await call(fam.token, 'GET', '/discover')).body.results.some((x) => x.user.id === ap.id));
  assert.equal((await call(ap.token, 'GET', '/likes')).body.likes[0].user.id, fam.id);
  assert.equal((await call(ap.token, 'GET', '/discover')).body.results.find((x) => x.user.id === fam.id).likes_you, true);

  // Au pair likes back: match, conversation opens
  r = await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'super' });
  assert.equal(r.body.matched, true);
  assert.ok(r.body.conversation_id);
  assert.equal((await call(ap.token, 'POST', `/conversations/${r.body.conversation_id}/messages`, { body: 'Yay!' })).status, 201);
  assert.equal((await call(ap.token, 'POST', '/swipe/undo')).status, 400, 'cannot undo a match');

  // Pass, then undo brings the card back
  await call(fam.token, 'POST', '/swipe', { target_id: ap2.id, direction: 'pass' });
  assert.ok(!(await call(fam.token, 'GET', '/discover')).body.results.some((x) => x.user.id === ap2.id));
  assert.equal((await call(fam.token, 'POST', '/swipe/undo')).body.user.id, ap2.id);
  assert.ok((await call(fam.token, 'GET', '/discover')).body.results.some((x) => x.user.id === ap2.id));
  assert.equal((await call(fam.token, 'POST', '/swipe', { target_id: ap.id + 1000, direction: 'like' })).status, 400);

  // Photo upload: real PNG accepted, fake rejected, reorder/remove works
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  r = await call(ap.token, 'POST', '/me/photos', { data_url: `data:image/png;base64,${png}` });
  assert.equal(r.status, 201);
  const first = r.body.photos[0];
  const img = await fetch(base.replace('/api', '') + first);
  assert.equal(img.status, 200);
  assert.equal((await call(ap.token, 'POST', '/me/photos', { data_url: `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}` })).status, 400);
  await call(ap.token, 'POST', '/me/photos', { data_url: `data:image/png;base64,${png}` });
  r = await call(ap.token, 'PUT', '/me/photos', { photos: [first] });
  assert.deepEqual(r.body.photos, [first]);
  assert.equal((await call(fam.token, 'GET', `/users/${ap.id}`)).body.user.photo_url, first);
});

test('corrected program rules: Norway closed to non-EU, NL max 25, UK closed, Australia paused', () => {
  const get = (c) => PROGRAMS.find((p) => p.code === c);
  const base = { start_date: '2027-01-01', end_date: '2027-12-31', weekly_hours: 25, pocket_money: 9999 };
  const no = get('NO');
  assert.equal(no.status, 'closed');
  assert.equal(checkCompliance(no, { ...base, birth_date: '2004-01-01', nationality: 'PH' }).ok, false);
  assert.equal(checkCompliance(no, { ...base, birth_date: '2004-01-01', nationality: 'PL' }).ok, true, 'EU citizens still allowed');
  const nl = get('NL');
  assert.equal(nl.max_age, 25);
  assert.equal(checkCompliance(nl, { ...base, pocket_money: 300, birth_date: '1999-06-01', nationality: 'BR' }).ok, false, '27-year-old refused');
  assert.equal(checkCompliance(get('GB'), { ...base, birth_date: '2004-01-01', nationality: 'FR' }).ok, false);
  const au = checkCompliance(get('AU'), { ...base, birth_date: '2004-01-01', nationality: 'DE' });
  assert.equal(au.ok, true);
  assert.ok(au.issues.some((i) => i.level === 'warning' && /stalled/.test(i.text)));
  const ap = { user: { id: 1, country: 'PH' }, profile: { nationality: 'PH', birth_date: '2004-01-01', languages: [{ code: 'en' }], preferred_countries: ['NO'] } };
  const m = scoreMatch(ap, { user: { id: 2, country: 'NO' }, profile: { start_date: '2027-01-01' } }, no);
  assert.ok(m.score <= 20 && m.warnings.some((w) => /no au pair route/.test(w)));
});

test('program corrections reach an existing database unless an admin edited the row', () => {
  const db = openDb(':memory:');
  createApp(db);
  db.prepare("UPDATE country_programs SET max_age = 30, status = 'open' WHERE code IN ('NL','NO')").run();
  db.prepare("UPDATE country_programs SET admin_edited = 1 WHERE code = 'NO'").run();
  createApp(db); // restart
  assert.equal(db.prepare("SELECT max_age FROM country_programs WHERE code = 'NL'").get().max_age, 25);
  assert.equal(db.prepare("SELECT status FROM country_programs WHERE code = 'NO'").get().status, 'open', 'admin edit kept');
});

test('email verification gates liking; forgot password resets with a code', async () => {
  const r = await call(null, 'POST', '/auth/register', { email: 'new@test.io', password: 'password123', role: 'aupair', name: 'New', country: 'PE' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email_verified, false);
  const fam = await register('verifyfam@test.io', 'family', 'US');
  const like = await call(r.body.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' });
  assert.equal(like.status, 403);
  assert.equal(like.body.code, 'email_unverified');
  assert.equal((await call(r.body.token, 'POST', '/swipe', { target_id: fam.id, direction: 'pass' })).status, 200);

  // Wrong code counts, the right one works once.
  assert.equal((await call(r.body.token, 'POST', '/auth/verify-email', { code: '000000' === lastCode('new@test.io') ? '111111' : '000000' })).status, 400);
  assert.equal((await call(r.body.token, 'POST', '/auth/verify-email', { code: lastCode('new@test.io') })).status, 200);
  assert.equal((await call(r.body.token, 'GET', '/me')).body.user.email_verified, true);
  await call(r.body.token, 'POST', '/swipe/undo');
  assert.equal((await call(r.body.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' })).status, 200);

  // Forgot password: same answer for unknown emails, code resets and signs out old sessions.
  const before = outbox.length;
  assert.equal((await call(null, 'POST', '/auth/forgot', { email: 'nobody@test.io' })).status, 200);
  assert.equal(outbox.length, before);
  assert.equal((await call(null, 'POST', '/auth/forgot', { email: 'new@test.io' })).status, 200);
  const code = lastCode('new@test.io');
  assert.equal((await call(null, 'POST', '/auth/reset', { email: 'new@test.io', code, password: 'short' })).status, 400);
  const reset = await call(null, 'POST', '/auth/reset', { email: 'new@test.io', code, password: 'newpassword1' });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await call(r.body.token, 'GET', '/me')).status, 401);
  assert.equal((await call(null, 'POST', '/auth/reset', { email: 'new@test.io', code, password: 'another123' })).status, 400);
  assert.equal((await call(null, 'POST', '/auth/login', { email: 'new@test.io', password: 'newpassword1' })).status, 200);

  // Five wrong guesses lock the code.
  await call(null, 'POST', '/auth/forgot', { email: 'new@test.io' });
  const real = lastCode('new@test.io');
  const wrong = real === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) await call(null, 'POST', '/auth/reset', { email: 'new@test.io', code: wrong, password: 'another123' });
  assert.equal((await call(null, 'POST', '/auth/reset', { email: 'new@test.io', code: real, password: 'another123' })).status, 400);
});

test('blocking hides both people from each other and closes the chat', async () => {
  const fam = await register('blockfam@test.io', 'family', 'US', 'Block Family');
  const ap = await register('blockap@test.io', 'aupair', 'CO', 'Block Aupair');
  await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' });
  const m = await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' });
  assert.equal(m.body.matched, true);
  const cid = m.body.conversation_id;
  assert.equal((await call(fam.token, 'POST', `/conversations/${cid}/messages`, { body: 'hi' })).status, 201);

  assert.equal((await call(ap.token, 'POST', `/users/${fam.id}/block`, { reason: 'Rude messages' })).status, 200);
  assert.equal((await call(fam.token, 'GET', `/users/${ap.id}`)).status, 404);
  const mine = await call(ap.token, 'GET', `/users/${fam.id}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.blocked, true);
  assert.equal((await call(fam.token, 'POST', `/conversations/${cid}/messages`, { body: 'hello?' })).status, 404);
  assert.ok(!(await call(fam.token, 'GET', '/conversations')).body.conversations.some((c) => c.id === cid));
  assert.ok(!(await call(fam.token, 'GET', '/search')).body.results.some((r) => r.user.id === ap.id));
  assert.equal((await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' })).status, 404);
  assert.equal((await call(ap.token, 'GET', '/blocks')).body.blocked[0].id, fam.id);

  assert.equal((await call(ap.token, 'DELETE', `/users/${fam.id}/block`)).status, 200);
  assert.equal((await call(fam.token, 'GET', `/users/${ap.id}`)).status, 200);
});

test('deleting an account removes the user, their photos and shared placements', async () => {
  const fam = await register('delfam@test.io', 'family', 'DE', 'Delete Family');
  const ap = await register('delap@test.io', 'aupair', 'CO', 'Delete Aupair');
  await call(ap.token, 'PUT', '/me', { profile: { birth_date: '2003-01-01', nationality: 'CO' } });
  await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' });
  await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' });
  const pl = await call(fam.token, 'POST', '/placements', { other_user_id: ap.id, start_date: '2027-01-01', end_date: '2027-12-31', weekly_hours: 30, pocket_money: 280 });
  assert.equal(pl.status, 201, JSON.stringify(pl.body));
  const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  assert.equal((await call(ap.token, 'POST', '/me/photos', { data_url: png })).status, 201);
  await call(fam.token, 'POST', '/reports', { target_user_id: ap.id, reason: 'test' });

  assert.equal((await call(ap.token, 'DELETE', '/me', { password: 'wrong' })).status, 401);
  assert.equal((await call(ap.token, 'DELETE', '/me', { password: 'password123' })).status, 200);
  assert.equal((await call(ap.token, 'GET', '/me')).status, 401);
  assert.equal((await call(null, 'POST', '/auth/login', { email: 'delap@test.io', password: 'password123' })).status, 401);
  assert.equal((await call(fam.token, 'GET', `/users/${ap.id}`)).status, 404);
  assert.equal((await call(fam.token, 'GET', '/placements')).body.placements.length, 0);
  assert.equal((await call(fam.token, 'GET', '/conversations')).body.conversations.length, 0);
  const { readdirSync } = await import('node:fs');
  assert.ok(!readdirSync(process.env.UPLOAD_DIR).some((f) => f.startsWith(`${ap.id}-`)));
});

test('sign-in ignores capital letters and spaces in the email', async () => {
  await register('casey@test.io', 'aupair', 'PE');
  const login = await call(null, 'POST', '/auth/login', { email: ' Casey@Test.io ', password: 'password123' });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const again = await call(null, 'POST', '/auth/register', { email: 'CASEY@test.io', password: 'password123', role: 'aupair', name: 'Dup', country: 'PE' });
  assert.equal(again.status, 409);
});
