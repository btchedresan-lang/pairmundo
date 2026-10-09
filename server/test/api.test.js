import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { scoreMatch, checkCompliance } from '../server/matching.js';
import { PROGRAMS } from '../server/programs.js';

let server; let base; let testDb;
const outbox = [];
const pushed = []; let pushReply = null;
let photoVerdict = null;
const lastCode = (to) => [...outbox].reverse().find((m) => m.to === to)?.text.match(/\b(\d{6})\b/)[1];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-test-');
  testDb = openDb(':memory:');
  const app = createApp(testDb, { mailer: async (m) => { outbox.push(m); }, pusher: async (msgs) => { pushed.push(...msgs); return pushReply ? msgs.map(pushReply) : msgs.map(() => ({ status: 'ok' })); },
    moderator: async () => photoVerdict ?? { verdict: 'allow', category: 'none', note: '' } });
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

  // Photo check: a rejected photo is refused; one to review goes live and files a report for the admins
  photoVerdict = { verdict: 'reject', category: 'nudity', note: 'Nude photo.' };
  r = await call(ap.token, 'POST', '/me/photos', { data_url: `data:image/png;base64,${png}` });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /can't be used/);
  assert.deepEqual((await call(ap.token, 'GET', '/me')).body.user.photos, [first]);
  photoVerdict = { verdict: 'review', category: 'child_in_photo', note: 'A child in the background.' };
  r = await call(ap.token, 'POST', '/me/photos', { data_url: `data:image/png;base64,${png}` });
  assert.equal(r.status, 400, 'photos of children need the parents\' permission');
  assert.equal(r.body.code, 'child_permission');
  r = await call(ap.token, 'POST', '/me/photos', { data_url: `data:image/png;base64,${png}`, child_permission: true });
  assert.equal(r.status, 201, 'and go live once it is confirmed');
  r = await call(ap.token, 'PUT', '/me/photos', { photos: [first] });
  photoVerdict = { verdict: 'review', category: 'contact_details', note: 'Shows a phone number.' };
  r = await call(ap.token, 'POST', '/me/photos', { data_url: `data:image/png;base64,${png}` });
  assert.equal(r.status, 201);
  const report = testDb.prepare('SELECT * FROM reports WHERE target_user_id = ? ORDER BY id DESC').get(ap.id);
  assert.match(report.reason, /^Automatic photo check \(contact_details\): Shows a phone number\. Photo: /);
  assert.ok(report.reason.endsWith(r.body.photos[1]));
  photoVerdict = null;
  await call(ap.token, 'PUT', '/me/photos', { photos: [first] });
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
  assert.ok(m.score <= 20 && m.warnings.some((w) => /Norway only has an au pair route for EU\/EEA citizens/.test(w)));
  // The same checks in the person's language, with country and language names translated.
  const es = scoreMatch(ap, { user: { id: 2, country: 'NO' }, profile: { start_date: '2027-01-01', required_languages: ['en'] } }, no, null, 'es');
  assert.ok(es.reasons.includes('Habla inglés'), JSON.stringify(es.reasons));
  assert.ok(es.warnings.includes('Noruega solo tiene vía de au pair para ciudadanos de la UE/EEE'), JSON.stringify(es.warnings));
  const de = checkCompliance(nl, { ...base, weekly_hours: 40, birth_date: '2004-01-01', nationality: 'BR' }, 'de');
  assert.ok(de.issues.some((i) => i.text === '40 Std./Woche überschreitet das Maximum von 30 Std.'), JSON.stringify(de.issues));
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

test('push notifications: matches and messages reach the phone; logout and uninstall stop them', async () => {
  const wait = () => new Promise((r) => setTimeout(r, 50));
  const fam = await register('pushfam@test.io', 'family', 'US', 'Push Family');
  const ap = await register('pushap@test.io', 'aupair', 'BR', 'Push Aupair');
  const tok = 'ExponentPushToken[abcdefghijklmnop]';
  assert.equal((await call(fam.token, 'POST', '/me/push-token', { token: 'nope' })).status, 400);
  assert.equal((await call(fam.token, 'POST', '/me/push-token', { token: tok })).status, 200);

  await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' });
  const m = await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' });
  await wait();
  const match = pushed.find((p) => p.to === tok && /match/i.test(p.body));
  assert.ok(match, JSON.stringify(pushed));
  assert.equal(match.data.link, `#/messages/${m.body.conversation_id}`);

  await call(ap.token, 'POST', `/conversations/${m.body.conversation_id}/messages`, { body: 'Hello from Brazil' });
  await wait();
  const msg = pushed.at(-1);
  assert.deepEqual([msg.to, msg.title, msg.body], [tok, 'Push Aupair', 'Hello from Brazil']);

  // Signing out with the token stops pushes to that phone.
  const before = pushed.length;
  await call(fam.token, 'POST', '/auth/logout', { push_token: tok });
  await call(ap.token, 'POST', `/conversations/${m.body.conversation_id}/messages`, { body: 'Still there?' });
  await wait();
  assert.equal(pushed.length, before);

  // A phone that uninstalled the app is forgotten after the first failed send.
  await call(ap.token, 'POST', '/me/push-token', { token: tok });
  pushReply = () => ({ status: 'error', details: { error: 'DeviceNotRegistered' } });
  const login = await call(null, 'POST', '/auth/login', { email: 'pushfam@test.io', password: 'password123' });
  await call(login.body.token, 'POST', `/conversations/${m.body.conversation_id}/messages`, { body: 'One' });
  await wait();
  pushReply = null;
  const n = pushed.length;
  await call(login.body.token, 'POST', `/conversations/${m.body.conversation_id}/messages`, { body: 'Two' });
  await wait();
  assert.equal(pushed.length, n);
});

test('sign-in ignores capital letters and spaces in the email', async () => {
  await register('casey@test.io', 'aupair', 'PE');
  const login = await call(null, 'POST', '/auth/login', { email: ' Casey@Test.io ', password: 'password123' });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const again = await call(null, 'POST', '/auth/register', { email: 'CASEY@test.io', password: 'password123', role: 'aupair', name: 'Dup', country: 'PE' });
  assert.equal(again.status, 409);
});

test('emails and notifications use the language of each person’s app', async () => {
  const lang = (l) => ({ 'Content-Type': 'application/json', 'Accept-Language': l });
  const res = await fetch(`${base}/auth/register`, { method: 'POST', headers: lang('es-MX,es;q=0.9,en;q=0.8'),
    body: JSON.stringify({ email: 'es@test.io', password: 'password123', role: 'aupair', name: 'Lucía', country: 'MX' }) });
  const es = await res.json();
  assert.equal(res.status, 201);
  const mail = outbox.findLast((m) => m.to === 'es@test.io');
  assert.match(mail.subject, /^Tu código de PairMundo: \d{6}$/);
  assert.match(mail.text, /Tu código de confirmación es \d{6}/);
  await call(es.token, 'POST', '/auth/verify-email', { code: lastCode('es@test.io') });

  // A German-speaking family; the server learns its language from the app's requests.
  const de = await register('de@test.io', 'family', 'DE', 'Familie Weber');
  await fetch(`${base}/me`, { headers: { ...lang('de-DE'), Authorization: `Bearer ${de.token}` } });

  await call(de.token, 'POST', '/swipe', { target_id: es.user.id, direction: 'like' });
  await call(es.token, 'POST', '/swipe', { target_id: de.id, direction: 'like' });
  const texts = async (token) => (await call(token, 'GET', '/notifications')).body.notifications.map((n) => n.text);
  assert.ok((await texts(es.token)).includes('Le gustas a alguien nuevo. Descubre quién en Likes.'));
  assert.ok((await texts(de.token)).includes('Es ist ein Match! Lucía mag dich auch.'));
  // Someone whose app sends no supported language gets English.
  const en = await register('en@test.io', 'family', 'US', 'The Browns');
  await call(en.token, 'POST', '/swipe', { target_id: es.user.id, direction: 'super' });
  await call(es.token, 'POST', '/swipe', { target_id: en.id, direction: 'like' });
  assert.ok((await texts(en.token)).includes("It's a match! Lucía liked you back."));
});

test('ID check: off without Stripe; with Stripe it gives a link and the badge once verified', async () => {
  // The shared test app has no Stripe key.
  const plain = await register('noid@test.io', 'aupair', 'PH');
  assert.equal((await call(plain.token, 'GET', '/me/id-check')).body.available, false);
  assert.equal((await call(plain.token, 'POST', '/me/id-check')).status, 503);

  // A second app with a stand-in for Stripe.
  const sessions = new Map();
  const identity = {
    async start(user, returnUrl) { const id = `vs_${sessions.size + 1}`; sessions.set(id, 'requires_input'); return { id, url: `https://verify.stripe.test/${id}?return=${encodeURIComponent(returnUrl)}`, status: 'requires_input' }; },
    async status(id) { return { status: sessions.get(id), error: null }; },
  };
  const { createHmac } = await import('node:crypto');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const app2 = createApp(openDb(':memory:'), { mailer: async (m) => { outbox.push(m); }, pusher: async (m) => m.map(() => ({ status: 'ok' })), identity });
  const srv = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  const call2 = async (token, method, path) => {
    const res = await fetch(b2 + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: res.status, body: await res.json() };
  };
  try {
    const reg = await (await fetch(`${b2}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'id@test.io', password: 'password123', role: 'aupair', name: 'Ida', country: 'PH' }) })).json();
    let r = await call2(reg.token, 'GET', '/me/id-check');
    assert.deepEqual(r.body, { available: true, verified: false, status: 'none', error: null });
    r = await call2(reg.token, 'POST', '/me/id-check');
    assert.equal(r.status, 200);
    assert.match(r.body.url, /^https:\/\/verify\.stripe\.test\/vs_1\?return=https%3A%2F%2Fpairmundo\.com%2Fid-check-done$/);
    assert.equal((await call2(reg.token, 'GET', '/me/id-check')).body.status, 'requires_input');

    // Stripe finishes; the app asks again and the badge appears without waiting for the webhook.
    sessions.set('vs_1', 'verified');
    r = await call2(reg.token, 'GET', '/me/id-check');
    assert.equal(r.body.verified, true);
    assert.equal((await call2(reg.token, 'GET', `/users/${reg.user.id}`)).body.user.verification.id, true);
    assert.equal((await call2(reg.token, 'POST', '/me/id-check')).status, 409);

    // Webhooks need Stripe's signature; a signed one updates the check.
    const reg2 = await (await fetch(`${b2}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'id2@test.io', password: 'password123', role: 'family', name: 'Fam', country: 'US' }) })).json();
    await call2(reg2.token, 'POST', '/me/id-check');
    const payload = JSON.stringify({ type: 'identity.verification_session.verified', data: { object: { id: 'vs_2', status: 'verified' } } });
    const hook = (sig) => fetch(`${b2}/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body: payload });
    const t = Math.floor(Date.now() / 1000);
    assert.equal((await hook(`t=${t},v1=${'0'.repeat(64)}`)).status, 400);
    assert.equal((await hook(`t=${t},v1=${createHmac('sha256', 'whsec_test').update(`${t}.${payload}`).digest('hex')}`)).status, 200);
    const me2 = await (await fetch(`${b2}/me`, { headers: { Authorization: `Bearer ${reg2.token}` } })).json();
    assert.equal(me2.user.verification.id, true);

    // Each check costs money, so only a few a day.
    const reg3 = await (await fetch(`${b2}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'id3@test.io', password: 'password123', role: 'aupair', name: 'Tri', country: 'PH' }) })).json();
    for (let i = 0; i < 3; i++) assert.equal((await call2(reg3.token, 'POST', '/me/id-check')).status, 200);
    assert.equal((await call2(reg3.token, 'POST', '/me/id-check')).status, 429);
  } finally { srv.close(); delete process.env.STRIPE_WEBHOOK_SECRET; }
});

test('Family Pass: when switched on, families need it to message and to see who liked them', async () => {
  const fam = await register('passfam@test.io', 'family', 'DE', 'Familie Pass');
  const ap = await register('passap@test.io', 'aupair', 'BR', 'Bia');
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' });

  // Off by default: nothing changes.
  assert.equal((await call(fam.token, 'GET', '/me')).body.pass.required, false);
  assert.equal((await call(fam.token, 'GET', '/likes')).body.likes.length, 1);

  process.env.FAMILY_PASS = 'on';
  try {
    let r = await call(fam.token, 'GET', '/likes');
    assert.deepEqual(r.body, { likes: [], locked: true, count: 1 });
    assert.equal((await call(fam.token, 'GET', `/users/${ap.id}`)).body.request, null, 'who liked you stays hidden');
    assert.equal((await call(fam.token, 'GET', '/requests')).body.incoming.length, 0);
    // Au pairs are free.
    assert.equal((await call(ap.token, 'GET', '/me')).body.pass.required, false);

    // Matching still works; messaging needs the pass, for the family only.
    const m = (await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' })).body;
    assert.ok(m.matched);
    assert.equal((await call(ap.token, 'POST', `/conversations/${m.conversation_id}/messages`, { body: 'Olá!' })).status, 201);
    r = await call(fam.token, 'POST', `/conversations/${m.conversation_id}/messages`, { body: 'Hallo!' });
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'pass_required');

    // A pass (here from an admin) unlocks it for 90 days, and a second one adds on.
    let pass;
    {
      r = await call(admin, 'POST', `/admin/users/${fam.id}`, { grant_pass_days: 90 });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      pass = (await call(fam.token, 'GET', '/family-pass')).body;
      assert.equal(pass.active, true);
      const end1 = new Date(pass.ends_at.replace(' ', 'T') + 'Z');
      assert.ok(Math.abs(end1 - Date.now() - 90 * 86400000) < 120000);
      assert.equal((await call(fam.token, 'POST', `/conversations/${m.conversation_id}/messages`, { body: 'Hallo!' })).status, 201);
      await call(admin, 'POST', `/admin/users/${fam.id}`, { grant_pass_days: 90 });
      pass = (await call(fam.token, 'GET', '/family-pass')).body;
      assert.ok(new Date(pass.ends_at.replace(' ', 'T') + 'Z') - end1 > 89 * 86400000);
    }

    // With FAMILY_TRIAL_DAYS set, a new family starts with a free trial; au pairs get nothing.
    process.env.FAMILY_TRIAL_DAYS = '14';
    const trialFam = await register('trial@test.io', 'family', 'DE');
    const trialAp = await register('trialap@test.io', 'aupair', 'PH');
    pass = (await call(trialFam.token, 'GET', '/family-pass')).body;
    assert.equal(pass.active, true);
    assert.equal(pass.trial, true);
    assert.ok(Math.abs(new Date(pass.ends_at.replace(' ', 'T') + 'Z') - Date.now() - 14 * 86400000) < 120000);
    assert.equal((await call(trialAp.token, 'GET', '/family-pass')).body.active, false);
    const listed = (await call(admin, 'GET', '/admin/users?q=trial@test.io')).body.users[0];
    assert.equal(listed.pass_ends_at, pass.ends_at);

    // The ad link a family came from is kept, and Admin counts sign-ups per link.
    await call(null, 'POST', '/auth/register', { email: 'adfam@test.io', password: 'password123', role: 'family', name: 'Ad Family', country: 'SE', source: 'Meta-Fam-SV-Trial' });
    assert.equal((await call(admin, 'GET', '/admin/users?q=adfam@test.io')).body.users[0].source, 'meta-fam-sv-trial');
    const row = (await call(admin, 'GET', '/admin/waitlist')).body.signups_by_source.find((x) => x.source === 'meta-fam-sv-trial');
    assert.deepEqual([row.families, row.aupairs], [1, 0]);
  } finally { delete process.env.FAMILY_PASS; delete process.env.FAMILY_TRIAL_DAYS; }
});

test('Family Pass on the website: Stripe Checkout link, and the pass once paid (once only)', async () => {
  const plain = await register('nopay@test.io', 'family', 'DE');
  assert.equal((await call(plain.token, 'GET', '/family-pass')).body.web_checkout, false);
  assert.equal((await call(plain.token, 'POST', '/family-pass/checkout')).status, 503);

  const sessions = new Map();
  const checkout = {
    async start(user, o) { const id = `cs_${sessions.size + 1}`; sessions.set(id, { paid: false, userId: user.id, o }); return { id, url: `https://checkout.stripe.test/${id}` }; },
    async result(id) { const s = sessions.get(id); if (!s) throw new Error('No such session'); return { paid: s.paid, userId: s.userId, plan: s.o.plan }; },
  };
  const { createHmac } = await import('node:crypto');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const db2 = openDb(':memory:');
  db2.prepare("INSERT INTO ambassadors (code, name) VALUES ('PAYCO', 'Pay Ambassador')").run();
  const app2 = createApp(db2, { mailer: async (m) => { outbox.push(m); }, pusher: async (m) => m.map(() => ({ status: 'ok' })), checkout });
  const srv = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  const call2 = async (token, method, path, body) => {
    const res = await fetch(b2 + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const reg = async (email, role, extra = {}) => (await (await fetch(`${b2}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', role, name: email, country: 'DE', ...extra }) })).json());
  try {
    const fam = await reg('pay@test.io', 'family', { ref_code: 'payco' });
    const ap = await reg('payap@test.io', 'aupair');
    assert.equal((await call2(ap.token, 'POST', '/family-pass/checkout')).status, 403);
    let r = await call2(fam.token, 'POST', '/family-pass/checkout');
    assert.equal(r.body.url, 'https://checkout.stripe.test/cs_1');
    const o = sessions.get('cs_1').o;
    assert.equal(o.amount, 7900);
    assert.equal(o.successUrl, 'https://pairmundo.com/#/family-pass?paid={CHECKOUT_SESSION_ID}');

    // Not paid yet, and someone else can't claim the session.
    assert.equal((await call2(fam.token, 'POST', '/family-pass/checkout/cs_1')).body.paid, false);
    sessions.get('cs_1').paid = true;
    assert.equal((await call2(ap.token, 'POST', '/family-pass/checkout/cs_1')).status, 404);
    assert.equal((await call2(fam.token, 'POST', '/family-pass/checkout/cs_9')).status, 404);
    r = await call2(fam.token, 'POST', '/family-pass/checkout/cs_1');
    assert.equal(r.body.paid, true);
    assert.equal(r.body.pass.active, true);
    const end1 = r.body.pass.ends_at;

    // Stripe's webhook for the same payment doesn't add a second pass; a new payment does.
    const hook = (id) => {
      const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid', metadata: { product: 'family_pass', user_id: String(fam.user.id) } } } });
      const t = Math.floor(Date.now() / 1000);
      return fetch(`${b2}/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${createHmac('sha256', 'whsec_test').update(`${t}.${payload}`).digest('hex')}` }, body: payload });
    };
    assert.equal((await hook('cs_1')).status, 200);
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.ends_at, end1);
    assert.equal((await hook('cs_2')).status, 200);
    const end2 = (await call2(fam.token, 'GET', '/family-pass')).body.ends_at;
    assert.notEqual(end2, end1);

    // The 1-month pass costs less and adds 30 days.
    assert.deepEqual((await call2(fam.token, 'GET', '/family-pass')).body.plans.map((p) => [p.id, p.days]), [['month', 30], ['quarter', 90]]);
    r = await call2(fam.token, 'POST', '/family-pass/checkout', { plan: 'month' });
    const o3 = sessions.get('cs_2').o;
    assert.equal(r.body.url, 'https://checkout.stripe.test/cs_2');
    assert.equal(o3.amount, 3900);
    assert.equal(o3.plan, 'month');
    sessions.get('cs_2').paid = true;
    // cs_2 was already counted by the webhook above; a fresh month session adds 30 days.
    await call2(fam.token, 'POST', '/family-pass/checkout', { plan: 'month' });
    sessions.get('cs_3').paid = true;
    const end3 = (await call2(fam.token, 'POST', '/family-pass/checkout/cs_3')).body.pass.ends_at;
    const days = (a, b) => (new Date(b.replace(' ', 'T') + 'Z') - new Date(a.replace(' ', 'T') + 'Z')) / 86400000;
    assert.equal(Math.round(days(end2, end3)), 30);

    // The family came with an ambassador's code: only their first paid pass earns the ambassador a reward (US$15).
    assert.deepEqual(db2.prepare('SELECT kind, amount_cents FROM referral_rewards').all().map((x) => ({ ...x })), [{ kind: 'pass', amount_cents: 1500 }]);
  } finally { srv.close(); delete process.env.STRIPE_WEBHOOK_SECRET; }
});

test('Family Pass in-app purchase: checked with RevenueCat, counted once, refunds end it', async () => {
  const plain = await register('noiap@test.io', 'family', 'DE');
  assert.equal((await call(plain.token, 'GET', '/family-pass')).body.product_id, 'family_pass_90');
  assert.equal((await call(plain.token, 'POST', '/family-pass/sync')).status, 503);

  const bought = new Map(); // app user id -> purchases
  const recent = new Date(Date.now() - 3600000).toISOString();
  const revenuecat = { async purchases(id) { return bought.get(id) || []; } };
  process.env.REVENUECAT_WEBHOOK_AUTH = 'rc_secret_test';
  const app2 = createApp(openDb(':memory:'), { mailer: async (m) => { outbox.push(m); }, pusher: async (m) => m.map(() => ({ status: 'ok' })), revenuecat });
  const srv = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  const call2 = async (token, method, path, body, headers = {}) => {
    const res = await fetch(b2 + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const reg = async (email, role) => (await call2(null, 'POST', '/auth/register', { email, password: 'password123', role, name: email, country: 'DE' })).body;
  try {
    const fam = await reg('iap@test.io', 'family');
    const ap = await reg('iapap@test.io', 'aupair');
    const id = String(fam.user.id);
    assert.equal((await call2(ap.token, 'POST', '/family-pass/sync')).status, 403);

    // Nothing bought yet; then a purchase, plus an old one and another product that don't count.
    let r = await call2(fam.token, 'POST', '/family-pass/sync');
    assert.equal(r.body.added, 0);
    assert.equal(r.body.pass.active, false);
    bought.set(id, [
      { ref: '1000001', store: 'app_store', product: 'family_pass_90', purchasedAt: recent },
      { ref: '1000000', store: 'app_store', product: 'family_pass_90', purchasedAt: '2025-01-01T00:00:00Z' },
      { ref: '1000002', store: 'app_store', product: 'something_else', purchasedAt: recent },
    ]);
    r = await call2(fam.token, 'POST', '/family-pass/sync');
    assert.equal(r.body.added, 1);
    assert.equal(r.body.pass.active, true);
    const end1 = r.body.pass.ends_at;
    assert.equal((await call2(fam.token, 'POST', '/family-pass/sync')).body.added, 0, 'restore does not count it twice');

    // RevenueCat's webhook needs the shared secret, and doesn't count the same purchase again.
    const hook = (event, auth = 'Bearer rc_secret_test') => call2(null, 'POST', '/revenuecat/webhook', { event }, { Authorization: auth });
    const ev = { type: 'NON_RENEWING_PURCHASE', app_user_id: id, product_id: 'family_pass_90', transaction_id: '1000001', store: 'APP_STORE' };
    assert.equal((await hook(ev, 'Bearer wrong')).status, 401);
    assert.equal((await hook(ev)).status, 200);
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.ends_at, end1);

    // A second purchase on Android adds 90 days after the first.
    assert.equal((await hook({ ...ev, transaction_id: 'GPA.1234', store: 'PLAY_STORE' })).status, 200);
    const end2 = (await call2(fam.token, 'GET', '/family-pass')).body.ends_at;
    assert.ok(new Date(end2.replace(' ', 'T') + 'Z') - new Date(end1.replace(' ', 'T') + 'Z') > 89 * 86400000);

    // The 1-month product adds 30 days.
    const end3 = await (async () => { await hook({ ...ev, product_id: 'family_pass_30', transaction_id: '1000003' }); return (await call2(fam.token, 'GET', '/family-pass')).body.ends_at; })();
    assert.equal(Math.round((new Date(end3.replace(' ', 'T') + 'Z') - new Date(end2.replace(' ', 'T') + 'Z')) / 86400000), 30);
    await hook({ ...ev, type: 'CANCELLATION', product_id: 'family_pass_30', transaction_id: '1000003' });

    // Refunding both ends the pass.
    await hook({ ...ev, type: 'CANCELLATION' });
    await hook({ ...ev, type: 'CANCELLATION', transaction_id: 'GPA.1234', store: 'PLAY_STORE' });
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.active, false);
  } finally { srv.close(); delete process.env.REVENUECAT_WEBHOOK_AUTH; }
});

test('waitlist: join once, email in their language, leave by link, admin sees it and downloads it', async () => {
  const join = (body, lang = 'en') => fetch(`${base}/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Language': lang }, body: JSON.stringify(body) });
  assert.equal((await join({ email: 'nope' })).status, 400);
  const before = outbox.length;
  let r = await join({ email: ' Wait@Test.io ', role: 'family', country: 'de', source: 'Flyer-Berlin' }, 'de-DE');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const mail = outbox.at(-1);
  assert.equal(mail.to, 'wait@test.io');
  assert.match(mail.subject, /Liste/);
  // Joining again looks the same and sends nothing.
  assert.equal((await join({ email: 'wait@test.io', role: 'aupair' })).status, 200);
  assert.equal(outbox.length, before + 1);
  await join({ email: '=cmd@test.io', role: 'aupair', source: 'bad source!' });

  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin2@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin2@test.io', password: 'password123' })).body.token;
  const w = (await call(admin, 'GET', '/admin/waitlist')).body;
  assert.equal(w.total, 2);
  assert.deepEqual(w.people.find((p) => p.email === 'wait@test.io'), { ...w.people.find((p) => p.email === 'wait@test.io'), role: 'family', country: 'DE', lang: 'de', source: 'flyer-berlin' });
  assert.equal(w.people.find((p) => p.email === '=cmd@test.io').source, null);
  assert.deepEqual(w.by_source.find((s) => s.source === 'flyer-berlin'), { source: 'flyer-berlin', n: 1 });
  const fam = await register('waitfam@test.io', 'family', 'DE');
  assert.equal((await call(fam.token, 'GET', '/admin/waitlist')).status, 403);
  const csv = await (await fetch(`${base}/admin/waitlist.csv`, { headers: { Authorization: `Bearer ${admin}` } })).text();
  assert.match(csv, /^email,role,country,language,source,referral code,joined\n/);
  assert.match(csv, /\n'=cmd@test\.io,aupair,/, 'formula-looking cells are defused');

  // The link in the email removes them, once.
  const link = mail.text.match(/https?:\/\/\S+/g).at(-1);
  const leave = (u) => fetch(`${base}/waitlist/leave${new URL(u).search}`).then((x) => x.text());
  assert.match(await leave(link), /off the list/);
  assert.match(await leave(link), /already used/);
  assert.equal((await call(admin, 'GET', '/admin/waitlist')).body.total, 1);
});

test('ambassadors: referral codes at sign-up, rewards counted once, monthly cap, their own numbers, payouts', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;

  let r = await call(admin, 'POST', '/admin/ambassadors', { code: 'ana-co', name: 'Ana Gómez', country: 'co', contact: '+57 300 000' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.code, 'ANA-CO');
  assert.equal(r.body.country, 'CO');
  assert.equal(r.body.link, 'https://pairmundo.com/?ref=ANA-CO');
  const amb = r.body.id;
  assert.equal((await call(admin, 'POST', '/admin/ambassadors', { code: 'Ana-Co', name: 'Copy' })).status, 409);
  assert.equal((await call(admin, 'POST', '/admin/ambassadors', { code: 'a!', name: 'Bad' })).status, 400);
  assert.equal((await call(admin, 'POST', '/admin/ambassadors', { code: 'NONAME' })).status, 400);

  // Anyone can check a code; only the first name shows.
  assert.deepEqual((await call(null, 'GET', '/referral/ana-co')).body, { code: 'ANA-CO', name: 'Ana' });
  assert.equal((await call(null, 'GET', '/referral/NOPE-1')).status, 404);

  // A wrong code stops sign-up, so a typo gets fixed; a right one is saved in any case and spacing.
  const regRef = async (email, role, code = ' ana-co ') => {
    const res = await call(null, 'POST', '/auth/register', { email, password: 'password123', role, name: email, country: 'CO', ref_code: code });
    if (res.status !== 201) return res;
    await call(res.body.token, 'POST', '/auth/verify-email', { code: lastCode(email) });
    return { token: res.body.token, id: res.body.user.id };
  };
  assert.equal((await regRef('refbad@test.io', 'aupair', 'NOPE')).status, 400);
  assert.equal(testDb.prepare("SELECT COUNT(*) n FROM users WHERE email = 'refbad@test.io'").get().n, 0);
  const ap = await regRef('refap@test.io', 'aupair');
  assert.equal(testDb.prepare('SELECT ref_code FROM users WHERE id = ?').get(ap.id).ref_code, 'ANA-CO');
  const join = (body) => fetch(`${base}/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await join({ email: 'refwait@test.io', ref_code: 'ana-co' });
  await join({ email: 'refwait2@test.io', ref_code: 'NOPE' });
  assert.equal(testDb.prepare("SELECT ref_code FROM waitlist WHERE email = 'refwait2@test.io'").get().ref_code, null);

  // The profile reward comes once the profile is complete, photo included, and the ID is verified, and only once.
  const stats = async () => (await call(admin, 'GET', `/admin/ambassadors/${amb}`)).body.stats;
  const profile = { bio: 'Hola', nationality: 'CO', birth_date: '2003-01-01', languages: [{ code: 'es', level: 'C2' }], available_from: '2027-01-01' };
  await call(ap.token, 'PUT', '/me', { profile });
  assert.equal((await stats()).profiles, 0);
  const png = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64')}`;
  assert.equal((await call(ap.token, 'POST', '/me/photos', { data_url: png })).status, 201);
  await call(ap.token, 'PUT', '/me', { profile });
  assert.equal((await stats()).profiles, 0, 'no reward before the ID check');
  assert.equal((await call(admin, 'POST', `/admin/users/${ap.id}`, { id_verified: true })).status, 200);
  let s = await stats();
  assert.deepEqual([s.waitlist, s.aupairs, s.profiles, s.earned_cents, s.owed_cents], [1, 1, 1, 200, 200]);

  // Linking the ambassador's own account lets them see their numbers in the app.
  const own = await register('ana@test.io', 'aupair', 'CO');
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}`, { account_email: 'nobody@test.io' })).status, 400);
  r = await call(admin, 'POST', `/admin/ambassadors/${amb}`, { account_email: 'ANA@test.io' });
  assert.equal(r.body.account_email, 'ana@test.io', JSON.stringify(r.body));
  assert.equal(r.body.contact, '+57 300 000', 'fields not sent stay as they were');
  assert.deepEqual((await call(own.token, 'GET', '/me')).body.ambassador, { code: 'ANA-CO' });
  const mine = (await call(own.token, 'GET', '/me/ambassador')).body;
  assert.equal(mine.link, 'https://pairmundo.com/?ref=ANA-CO');
  assert.deepEqual([mine.this_month.aupairs, mine.this_month.profiles, mine.total.earned_cents], [1, 1, 200]);
  assert.equal((await call(ap.token, 'GET', '/me/ambassador')).status, 404);
  assert.equal((await call(ap.token, 'GET', '/admin/ambassadors')).status, 403);

  // A stay that starts earns the placement reward for each referred side.
  const fam = await regRef('reffam@test.io', 'family');
  const pid = testDb.prepare(`INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money, status, aupair_confirmed, family_confirmed, created_by)
    VALUES (?, ?, 'DE', '2027-01-01', '2027-12-31', 30, 280, 'confirmed', 1, 1, ?)`).run(ap.id, fam.id, fam.id).lastInsertRowid;
  assert.equal((await call(fam.token, 'POST', `/placements/${pid}/status`, { status: 'active' })).status, 200);
  s = await stats();
  assert.deepEqual([s.families, s.placements, s.earned_cents], [1, 2, 8200]);

  // Profile rewards stop at the monthly cap, but the profile still counts.
  testDb.prepare("INSERT INTO referral_rewards (ambassador_id, user_id, kind, amount_cents) VALUES (?, NULL, 'profile', 9850)").run(amb);
  const ap2 = await regRef('refap2@test.io', 'aupair');
  testDb.prepare('UPDATE users SET id_verified = 1 WHERE id = ?').run(ap2.id);
  await call(ap2.token, 'POST', '/me/photos', { data_url: png });
  await call(ap2.token, 'PUT', '/me', { profile });
  assert.deepEqual({ ...testDb.prepare("SELECT amount_cents FROM referral_rewards WHERE user_id = ? AND kind = 'profile'").get(ap2.id) }, { amount_cents: 0 });

  // The list, the payout sheet, and marking a month paid.
  const month = new Date().toISOString().slice(0, 7);
  const list = (await call(admin, 'GET', `/admin/ambassadors?month=${month}`)).body;
  assert.equal(list.ambassadors.find((a) => a.id === amb).stats.earned_cents, 18050);
  const csv = await (await fetch(`${base}/admin/ambassadors.csv?month=${month}`, { headers: { Authorization: `Bearer ${admin}` } })).text();
  assert.match(csv, /^code,name,country,contact,active,waitlist,au pairs,families,au pair profiles,family passes,placements,earned \d{4}-\d{2} \(USD\),owed now \(USD\)\n/);
  assert.match(csv, /\nANA-CO,Ana Gómez,CO,'\+57 300 000,yes,1,2,1,3,0,2,180\.50,180\.50\n/);
  r = await call(admin, 'POST', `/admin/ambassadors/${amb}/paid`, { month });
  assert.equal(r.body.marked, 5);
  assert.equal(r.body.stats.owed_cents, 0);
  assert.equal(r.body.stats.earned_cents, 18050);

  // Someone who joined the waitlist through the link and signs up later without the code still counts, and keeps
  // the flyer they came from; a code typed at sign-up wins.
  await join({ email: 'refwait3@test.io', ref_code: 'ana-co', source: 'salon-ostermalm' });
  await join({ email: 'refwait4@test.io', ref_code: 'ana-co' });
  await call(null, 'POST', '/auth/register', { email: 'refwait3@test.io', password: 'password123', role: 'family', name: 'W3' });
  assert.deepEqual({ ...testDb.prepare("SELECT ref_code, source FROM users WHERE email = 'refwait3@test.io'").get() }, { ref_code: 'ANA-CO', source: 'salon-ostermalm' });
  testDb.prepare("INSERT INTO ambassadors (code, name) VALUES ('OTHER-1', 'Other')").run();
  await call(null, 'POST', '/auth/register', { email: 'refwait4@test.io', password: 'password123', role: 'family', name: 'W4', ref_code: 'other-1' });
  assert.equal(testDb.prepare("SELECT ref_code FROM users WHERE email = 'refwait4@test.io'").get().ref_code, 'OTHER-1');

  // A paused ambassador's code stops working, and they no longer earn.
  await call(admin, 'POST', `/admin/ambassadors/${amb}`, { active: false });
  await join({ email: 'refwait5@test.io', ref_code: 'ana-co' });
  testDb.prepare("UPDATE waitlist SET ref_code = 'ANA-CO' WHERE email = 'refwait5@test.io'").run();
  await call(null, 'POST', '/auth/register', { email: 'refwait5@test.io', password: 'password123', role: 'family', name: 'W5' });
  assert.equal(testDb.prepare("SELECT ref_code FROM users WHERE email = 'refwait5@test.io'").get().ref_code, null);
  assert.equal((await call(null, 'GET', '/referral/ANA-CO')).status, 404);
  assert.equal((await call(own.token, 'GET', '/me')).body.ambassador, null);
});

test('au pairs add certificates and language levels; families can show only CPR or first aid', async () => {
  const fam = await register('certfam@test.io', 'family', 'SE', 'Familjen Cert');
  const ap = await register('certap@test.io', 'aupair', 'PL', 'Cert Aupair');
  const plain = await register('plainap@test.io', 'aupair', 'PL', 'Plain Aupair');
  let r = await call(ap.token, 'PUT', '/me', { profile: {
    certificates: [{ kind: 'cpr', detail: '  Red Cross, 2026 ' }, { kind: 'cpr', detail: 'again' }, { kind: 'language', detail: 'x'.repeat(200) }, { kind: 'Bad Kind!' }],
    languages: [{ code: 'en', level: 'C1' }, { code: 'de', level: 'Z9' }, { code: 'en', level: 'A1' }],
  } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.profile.certificates.map((c) => c.kind), ['cpr', 'language']);
  assert.equal(r.body.profile.certificates[0].detail, 'Red Cross, 2026');
  assert.equal(r.body.profile.certificates[1].detail.length, 80);
  assert.deepEqual(r.body.profile.languages, [{ code: 'en', level: 'C1' }, { code: 'de', level: 'B2' }]);
  r = await call(fam.token, 'GET', '/search?cpr=1');
  const ids = r.body.results.map((x) => x.user.id);
  assert.ok(ids.includes(ap.id));
  assert.ok(!ids.includes(plain.id));
});

test('video calls: start from a chat, join while open, private Daily rooms when a key is set', async () => {
  const fam = await register('callfam@test.io', 'family', 'SE', 'Familjen Lind');
  const ap = await register('callap@test.io', 'aupair', 'PH', 'Rosa Cruz');
  const stranger = await register('callstranger@test.io', 'aupair', 'PH');
  const req = await call(fam.token, 'POST', '/requests', { to_user: ap.id });
  await call(ap.token, 'POST', `/requests/${req.body.id}/respond`, { action: 'accept' });
  const conv = (await call(ap.token, 'POST', '/conversations', { user_id: fam.id })).body.id;

  const started = await call(ap.token, 'POST', `/conversations/${conv}/calls`);
  assert.equal(started.status, 201);
  assert.equal(started.body.is_call, 1);
  assert.equal(started.body.call_open, 1);
  assert.equal(started.body.call_url, undefined);
  // Starting again while the call is open returns the same call instead of a second one.
  assert.equal((await call(fam.token, 'POST', `/conversations/${conv}/calls`)).body.id, started.body.id);
  const join = await call(fam.token, 'POST', `/conversations/${conv}/calls/${started.body.id}/join`);
  assert.match(join.body.url, /^https:\/\/meet\.jit\.si\/PairMundo-[0-9a-f]{24}#userInfo\.displayName=/);
  assert.equal((await call(stranger.token, 'POST', `/conversations/${conv}/calls/${started.body.id}/join`)).status, 404);
  const msgs = (await call(fam.token, 'GET', `/conversations/${conv}/messages`)).body.messages;
  assert.equal(msgs.filter((m) => m.is_call).length, 1);
  // After two hours the call is closed.
  testDb.prepare("UPDATE messages SET created_at = datetime('now', '-3 hours') WHERE id = ?").run(started.body.id);
  assert.equal((await call(fam.token, 'POST', `/conversations/${conv}/calls/${started.body.id}/join`)).status, 410);
  assert.notEqual((await call(fam.token, 'POST', `/conversations/${conv}/calls`)).body.id, started.body.id);

  const { createVideo } = await import('../server/video.js');
  const sent = [];
  const fake = async (url, opts) => {
    sent.push([url, JSON.parse(opts.body)]);
    return { ok: true, json: async () => (url.endsWith('/rooms') ? { url: 'https://pairmundo.daily.co/abc123' } : { token: 'tok' }) };
  };
  const v = createVideo({ apiKey: 'k', fetchImpl: fake });
  const room = await v.createRoom();
  assert.equal(room, 'https://pairmundo.daily.co/abc123');
  assert.equal(sent[0][1].privacy, 'private');
  assert.equal(await v.joinUrl(room, 'Rosa Cruz'), 'https://pairmundo.daily.co/abc123?t=tok');
  assert.equal(sent[1][1].properties.room_name, 'abc123');
});
