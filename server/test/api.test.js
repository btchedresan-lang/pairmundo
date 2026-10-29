import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { scoreMatch, checkCompliance } from '../server/matching.js';
import { PROGRAMS, visaRoute } from '../server/programs.js';

let server; let base; let testDb; let app;
const outbox = [];
const pushed = []; let pushReply = null;
let photoVerdict = null;
const lastCode = (to) => [...outbox].reverse().find((m) => m.to === to)?.text.match(/\b(\d{6})\b/)[1];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-test-');
  testDb = openDb(':memory:');
  app = createApp(testDb, { mailer: async (m) => { outbox.push(m); }, pusher: async (msgs) => { pushed.push(...msgs); return pushReply ? msgs.map(pushReply) : msgs.map(() => ({ status: 'ok' })); },
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
/** Gives a member a photo and a bio, which others need to see them in Discover and which they need to like. */
const completeProfile = async (token, id, name = 'me') => {
  testDb.prepare('UPDATE users SET photo_url = ?, photos = ? WHERE id = ?').run('/uploads/test.jpg', JSON.stringify(['/uploads/test.jpg']), id);
  assert.equal((await call(token, 'PUT', '/me', { profile: { bio: `Hi, I am ${name}.` } })).status, 200);
};
/** Signs up, confirms the email and, unless `complete` is false, fills in the profile basics. */
const register = async (email, role, country, name = email, { complete = true } = {}) => {
  const r = await call(null, 'POST', '/auth/register', { email, password: 'password123', role, name, country });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const v = await call(r.body.token, 'POST', '/auth/verify-email', { code: lastCode(email) });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  if (complete) await completeProfile(r.body.token, r.body.user.id, name);
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

test('names: others see first name and last initial; the full name only after a confirmed placement', async () => {
  const fam = await register('namefam@test.io', 'family', 'DE', 'Familie Nachname');
  const ap = await register('nameap@test.io', 'aupair', 'PL', 'Zofia Maria Łukasik');
  const other = await register('nameap2@test.io', 'aupair', 'BR', 'Solo');
  await call(ap.token, 'PUT', '/me', { profile: { bio: 'Hi, I love kids.' } });
  await call(fam.token, 'PUT', '/me', { profile: { children: [{ age: 3 }], languages: ['de'], start_date: '2027-01-01', duration_months: 12, weekly_hours: 30, pocket_money: 280 } });

  assert.equal((await call(ap.token, 'GET', '/me')).body.user.name, 'Zofia Maria Łukasik', 'you see your own full name');
  const card = (await call(fam.token, 'GET', '/discover')).body.results.find((x) => x.user.id === ap.id);
  assert.equal(card.user.name, 'Zofia Ł.');
  assert.equal((await call(fam.token, 'GET', `/users/${other.id}`)).body.user.name, 'Solo');
  assert.ok(!(await call(fam.token, 'GET', '/search?q=Łukasik')).body.results.length, 'a search cannot confirm a hidden last name');
  assert.ok((await call(fam.token, 'GET', '/search?q=Zofia')).body.results.some((x) => x.user.id === ap.id));

  await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' });
  const match = (await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' })).body;
  assert.equal(match.other.name, 'Familie N.');
  const convs = (await call(fam.token, 'GET', '/conversations')).body.conversations;
  assert.equal(convs.find((c) => c.other.id === ap.id).other.name, 'Zofia Ł.');
  assert.ok(!JSON.stringify((await call(fam.token, 'GET', '/notifications')).body).includes('Łukasik'));

  const pid = (await call(fam.token, 'POST', '/placements', { other_user_id: ap.id, start_date: '2027-01-01', end_date: '2027-12-31', weekly_hours: 30, pocket_money: 280 })).body.id;
  assert.equal((await call(fam.token, 'GET', `/placements/${pid}`)).body.aupair.name, 'Zofia Ł.', 'a proposal is not enough');
  await call(ap.token, 'POST', `/placements/${pid}/confirm`);
  assert.equal((await call(fam.token, 'GET', `/placements/${pid}`)).body.aupair.name, 'Zofia Maria Łukasik');
  assert.equal((await call(ap.token, 'GET', `/users/${fam.id}`)).body.user.name, 'Familie Nachname');
  assert.equal((await call(other.token, 'GET', `/users/${ap.id}`)).body.user.name, 'Zofia Ł.', 'everyone else still sees the short name');
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
  const first = r.body.photos.at(-1);
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

test('a photo and a bio are needed to appear in Discover and to like; browsing works without them', async () => {
  const fam = await register('gatefam@test.io', 'family', 'IE', 'Gate Family');
  const ap = await register('gateap@test.io', 'aupair', 'BR', 'Gate Aupair', { complete: false });
  assert.deepEqual((await call(ap.token, 'GET', '/me')).body.profile_missing, ['photo', 'bio']);

  // The new au pair can browse, but nobody sees them yet and they can't like.
  assert.ok((await call(ap.token, 'GET', '/discover')).body.results.some((x) => x.user.id === fam.id));
  assert.ok(!(await call(fam.token, 'GET', '/discover')).body.results.some((x) => x.user.id === ap.id));
  assert.ok(!(await call(fam.token, 'GET', '/search')).body.results.some((x) => x.user.id === ap.id));
  let r = await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'profile_incomplete');
  assert.equal((await call(ap.token, 'POST', '/requests', { to_user: fam.id })).body.code, 'profile_incomplete');

  // A bio alone isn't enough; the photo completes it.
  await call(ap.token, 'PUT', '/me', { profile: { bio: '   ' } });
  assert.deepEqual((await call(ap.token, 'GET', '/me')).body.profile_missing, ['photo', 'bio']);
  await call(ap.token, 'PUT', '/me', { profile: { bio: 'Hi!' } });
  assert.deepEqual((await call(ap.token, 'GET', '/me')).body.profile_missing, ['photo']);
  await completeProfile(ap.token, ap.id);
  assert.deepEqual((await call(ap.token, 'GET', '/me')).body.profile_missing, []);
  assert.ok((await call(fam.token, 'GET', '/discover')).body.results.some((x) => x.user.id === ap.id));
  assert.equal((await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' })).status, 200);
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
  await completeProfile(r.body.token, r.body.user.id, 'New');
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
  assert.deepEqual([msg.to, msg.title, msg.body], [tok, 'Push A.', 'Hello from Brazil']);

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
  await completeProfile(es.token, es.user.id, 'Lucía');

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

    // When Stripe refuses (for example, Identity not activated), people get a clear message instead of a generic error.
    identity.start = async () => { throw new Error('Stripe 400: Identity is not enabled for this account'); };
    const reg4 = await (await fetch(`${b2}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'id4@test.io', password: 'password123', role: 'aupair', name: 'Quad', country: 'PH' }) })).json();
    r = await call2(reg4.token, 'POST', '/me/id-check');
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "The ID check isn't working right now. Please try again later.");
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

test('Family Pass: reminders go out as it runs out, once each, and start over after renewing', async () => {
  const fam = await register('remind@test.io', 'family', 'DE', 'Familie Erinnerung');
  // Moves the pass's end date relative to now; reminders already sent move with it, as if time had passed.
  const setEnd = (sql) => {
    const end = testDb.prepare(`SELECT datetime('now', '${sql}') d`).get().d;
    testDb.prepare('UPDATE pass_reminders SET ends_at = ? WHERE user_id = ?').run(end, fam.id);
    testDb.prepare('UPDATE passes SET ends_at = ? WHERE user_id = ?').run(end, fam.id);
  };
  const mine = () => outbox.filter((m) => m.to === 'remind@test.io' && /Family Pass/.test(m.subject));
  testDb.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?, 'admin', NULL, datetime('now', '-80 days'), datetime('now', '+10 days'))").run(fam.id);

  // Off unless the Family Pass is switched on.
  setEnd('+2 days');
  assert.equal(app.sendPassReminders(), 0);

  process.env.FAMILY_PASS = 'on';
  try {
    setEnd('+10 days');
    assert.equal(app.sendPassReminders(), 0, 'nothing while plenty of time is left');

    setEnd('+2 days');
    assert.equal(app.sendPassReminders(), 1);
    assert.equal(app.sendPassReminders(), 0, 'each reminder is sent once');
    assert.match(mine().at(-1).subject, /ends in 2 days/);
    assert.match(mine().at(-1).text, /#\/family-pass/);
    const note = (await call(fam.token, 'GET', '/notifications')).body.notifications[0];
    assert.equal(note.link, '#/family-pass');
    assert.match(note.text, /ends in 2 days/);

    // Later stages for the same end date: the last day, then just after it ends.
    setEnd('+3 hours');
    assert.equal(app.sendPassReminders(), 1);
    assert.match(mine().at(-1).subject, /within 24 hours/);
    setEnd('-1 hours');
    assert.equal(app.sendPassReminders(), 1);
    assert.match(mine().at(-1).subject, /has ended/);
    assert.equal(app.sendPassReminders(), 0);

    // Long expired: no nudge.
    setEnd('-5 days');
    assert.equal(app.sendPassReminders(), 0);

    // A renewed pass that ends later means no reminder about the earlier one.
    setEnd('+2 days');
    testDb.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?, 'admin', NULL, datetime('now', '+2 days'), datetime('now', '+32 days'))").run(fam.id);
    assert.equal(app.sendPassReminders(), 0);
  } finally { delete process.env.FAMILY_PASS; }
});

test('nudges: families hear to start looking for the next au pair about 3 months before the year ends', async () => {
  const fam = await register('nextap@test.io', 'family', 'DE', 'Familie Weiter');
  const ap = await register('nextap-ap@test.io', 'aupair', 'BR', 'Camila Souza');
  const mine = () => outbox.filter((m) => m.to === 'nextap@test.io' && /next au pair/.test(m.subject));
  const placement = testDb.prepare(`INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money, status, created_by)
    VALUES (?, ?, 'DE', date('now', '-9 months'), date('now', '+120 days'), 30, 280, 'active', ?)`).run(ap.id, fam.id, fam.id).lastInsertRowid;
  const setEnd = (days) => testDb.prepare(`UPDATE placements SET end_date = date('now', '${days} days') WHERE id = ?`).run(placement);

  assert.equal(app.sendSearchNudges(), 0, 'too early with 120 days left');
  setEnd('+80');
  assert.equal(app.sendSearchNudges(), 1);
  assert.equal(app.sendSearchNudges(), 0, 'sent once');
  assert.match(mine().at(-1).text, /Camila's stay with you ends on/);
  assert.match(mine().at(-1).text, /#\/discover/);
  assert.equal((await call(fam.token, 'GET', '/notifications')).body.notifications[0].link, '#/discover');

  // Cancelled stays don't count. A family without a stay in the app hears 9 months after their last pass ended.
  testDb.prepare("UPDATE placements SET status = 'cancelled' WHERE id = ?").run(placement);
  testDb.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?, 'admin', NULL, datetime('now', '-400 days'), datetime('now', '-200 days'))").run(fam.id);
  assert.equal(app.sendSearchNudges(), 0, 'too soon after the pass');
  testDb.prepare("UPDATE passes SET ends_at = datetime('now', '-280 days') WHERE user_id = ?").run(fam.id);
  assert.equal(app.sendSearchNudges(), 1);
  assert.match(mine().at(-1).text, /start looking for your next au pair/);
  assert.equal(app.sendSearchNudges(), 0);

  // Au pairs never get these.
  assert.equal(outbox.filter((m) => m.to === 'nextap-ap@test.io' && /next au pair/.test(m.subject)).length, 0);
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
    assert.deepEqual((await call2(fam.token, 'GET', '/family-pass')).body.plans.map((p) => [p.id, p.days]), [['month', 30], ['quarter', 90], ['half', 180]]);
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

    // The 1-month product adds 30 days (bought on the App Store, where its ID is family_pass_1m).
    const end3 = await (async () => { await hook({ ...ev, product_id: 'family_pass_1m', transaction_id: '1000003' }); return (await call2(fam.token, 'GET', '/family-pass')).body.ends_at; })();
    assert.equal(Math.round((new Date(end3.replace(' ', 'T') + 'Z') - new Date(end2.replace(' ', 'T') + 'Z')) / 86400000), 30);
    await hook({ ...ev, type: 'CANCELLATION', product_id: 'family_pass_1m', transaction_id: '1000003' });

    // Refunding both ends the pass.
    await hook({ ...ev, type: 'CANCELLATION' });
    await hook({ ...ev, type: 'CANCELLATION', transaction_id: 'GPA.1234', store: 'PLAY_STORE' });
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.active, false);

    // The Rematch Guarantee bought in the app is counted the same way, and a refund stops it covering.
    await hook({ ...ev, product_id: 'rematch_guarantee', transaction_id: 'RM1' });
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.rematch.active, true);
    await hook({ ...ev, type: 'REFUND', product_id: 'rematch_guarantee', transaction_id: 'RM1' });
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.rematch.active, false);
  } finally { srv.close(); delete process.env.REVENUECAT_WEBHOOK_AUTH; }
});

test('Rematch Guarantee: bought once, covers one placement, and a placement that ends early gives a free 3-month pass', async () => {
  const sessions = new Map();
  const checkout = {
    async start(user, o) { const id = `rm_${sessions.size + 1}`; sessions.set(id, { paid: false, userId: user.id, o }); return { id, url: `https://checkout.stripe.test/${id}` }; },
    async result(id) { const s = sessions.get(id); if (!s) throw new Error('No such session'); return { paid: s.paid, userId: s.userId, plan: s.o.plan }; },
  };
  const db2 = openDb(':memory:');
  const app2 = createApp(db2, { mailer: async (m) => { outbox.push(m); }, pusher: async (m) => m.map(() => ({ status: 'ok' })), checkout });
  const srv = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  const call2 = async (token, method, path, body) => {
    const res = await fetch(b2 + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const reg = async (email, role) => (await call2(null, 'POST', '/auth/register', { email, password: 'password123', role, name: email, country: 'SE' })).body;
  const placement = (fam, ap, status, start) => Number(db2.prepare(`INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money, status, created_by)
    VALUES (?, ?, 'SE', date('now', ?), date('now', '+300 days'), 25, 5000, ?, ?)`).run(ap.user.id, fam.user.id, start, status, fam.user.id).lastInsertRowid);
  const passDays = async (token) => { const p = (await call2(token, 'GET', '/family-pass')).body; return p.active ? Math.round((new Date(p.ends_at.replace(' ', 'T') + 'Z') - Date.now()) / 86400000) : 0; };
  const buy = async (token) => {
    const r = await call2(token, 'POST', '/family-pass/checkout', { plan: 'rematch' });
    const id = r.body.url.split('/').pop();
    sessions.get(id).paid = true;
    return call2(token, 'POST', `/family-pass/checkout/${id}`);
  };
  try {
    const fam = await reg('rematch@test.io', 'family');
    const ap = await reg('rematch-ap@test.io', 'aupair');
    let rm = (await call2(fam.token, 'GET', '/family-pass')).body.rematch;
    assert.deepEqual([rm.price, rm.can_buy, rm.active, rm.pass_days], ['€29', true, false, 90]);
    assert.equal((await call2(ap.token, 'GET', '/family-pass')).body.rematch, null, 'au pairs never see it');

    // Bought on the website for €29, it covers the family's confirmed placement; a second one can't be bought.
    const p1 = placement(fam, ap, 'confirmed', '+20 days');
    let r = await buy(fam.token);
    assert.equal(sessions.get('rm_1').o.amount, 2900);
    assert.equal(r.body.paid, true);
    rm = r.body.pass.rematch;
    assert.deepEqual([rm.active, rm.placement_id, rm.can_buy], [true, p1, false]);
    assert.equal((await call2(fam.token, 'POST', '/family-pass/checkout', { plan: 'rematch' })).status, 409);
    assert.equal(await passDays(fam.token), 0, 'buying it gives no pass days by itself');
    assert.deepEqual((await call2(fam.token, 'GET', `/placements/${p1}`)).body.rematch, { covered: true, claimed: false });
    assert.equal((await call2(ap.token, 'GET', `/placements/${p1}`)).body.rematch, null);

    // The stay starts, then the au pair leaves early: the family gets 90 free days, once.
    assert.equal((await call2(fam.token, 'POST', `/placements/${p1}/status`, { status: 'active' })).status, 200);
    assert.equal((await call2(ap.token, 'POST', `/placements/${p1}/status`, { status: 'cancelled' })).status, 200);
    assert.equal(await passDays(fam.token), 90);
    assert.deepEqual((await call2(fam.token, 'GET', `/placements/${p1}`)).body.rematch, { covered: true, claimed: true });
    assert.match((await call2(fam.token, 'GET', '/notifications')).body.notifications[0].text, /Rematch Guarantee/);
    rm = (await call2(fam.token, 'GET', '/family-pass')).body.rematch;
    assert.deepEqual([rm.active, rm.can_buy, !!rm.last_claimed_at], [false, true, true]);

    // Bought with no placement yet, it waits and covers the next one once both confirm.
    await buy(fam.token);
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.rematch.placement_id, null);
    const p2 = placement(fam, ap, 'proposed', '+30 days');
    await call2(ap.token, 'POST', `/placements/${p2}/confirm`);
    await call2(fam.token, 'POST', `/placements/${p2}/confirm`);
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.rematch.placement_id, p2);

    // More than 6 months into the stay, ending it gives nothing, and the guarantee is used up.
    db2.prepare("UPDATE placements SET status = 'active', start_date = date('now', '-200 days') WHERE id = ?").run(p2);
    const before = await passDays(fam.token);
    await call2(fam.token, 'POST', `/placements/${p2}/status`, { status: 'cancelled' });
    assert.equal(await passDays(fam.token), before);
    assert.equal((await call2(fam.token, 'GET', '/family-pass')).body.rematch.can_buy, true);
  } finally { srv.close(); }
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
  // Its link opens the family sign-up page with their email filled in.
  assert.ok(mail.text.includes('https://pairmundo.com/#/register?role=family&email=wait%40test.io'));
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
  assert.deepEqual((await call(null, 'GET', '/referral/ana-co')).body, { code: 'ANA-CO', name: 'Ana', kind: 'ambassador' });
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
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}`, { account_email: 'not-an-email' })).status, 400);
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}`, { account_email: 'admin@test.io' })).status, 400);
  r = await call(admin, 'POST', `/admin/ambassadors/${amb}`, { account_email: 'ANA@test.io' });
  assert.equal(r.body.account_email, 'ana@test.io', JSON.stringify(r.body));
  assert.equal(r.body.contact, '+57 300 000', 'fields not sent stay as they were');
  assert.deepEqual((await call(own.token, 'GET', '/me')).body.ambassador, { code: 'ANA-CO', kind: 'ambassador' });
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

test('partner agencies: their code tags au pairs, shows on the profile, earns nothing, and can be added later', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  const r = await call(admin, 'POST', '/admin/ambassadors', { code: 'alpha-zw', name: 'Alpha Academy', country: 'zw', kind: 'agency' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'agency');
  const agencyId = r.body.id;
  // Its full name shows to people who follow its link.
  assert.deepEqual((await call(null, 'GET', '/referral/ALPHA-ZW')).body, { code: 'ALPHA-ZW', name: 'Alpha Academy', kind: 'agency' });

  const res = await call(null, 'POST', '/auth/register', { email: 'agap@test.io', password: 'password123', role: 'aupair', name: 'Rudo Moyo', country: 'ZW', ref_code: 'alpha-zw' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const ap = { token: res.body.token, id: res.body.user.id };
  await call(ap.token, 'POST', '/auth/verify-email', { code: lastCode('agap@test.io') });
  const fam = await register('agfam@test.io', 'family', 'SE');
  assert.equal((await call(fam.token, 'GET', `/users/${ap.id}`)).body.user.agency, 'Alpha Academy');
  assert.equal((await call(ap.token, 'GET', '/me')).body.user.agency, 'Alpha Academy');

  // A complete, ID-verified profile earns an agency nothing.
  const png = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64')}`;
  await call(ap.token, 'POST', '/me/photos', { data_url: png });
  await call(ap.token, 'PUT', '/me', { profile: { bio: 'Hi', nationality: 'ZW', birth_date: '2003-01-01', languages: [{ code: 'en', level: 'C2' }], available_from: '2027-01-01' } });
  await call(admin, 'POST', `/admin/users/${ap.id}`, { id_verified: true });
  const st = (await call(admin, 'GET', `/admin/ambassadors/${agencyId}`)).body;
  // Its done profiles still count, from the profiles themselves.
  assert.deepEqual([st.stats.aupairs, st.stats.profiles, st.stats.earned_cents], [1, 1, 0]);
  assert.equal(st.referrals.length, 1);

  // An au pair account is never the agency's own account, so it still counts as one of its au pairs.
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${agencyId}`, { account_email: 'agap@test.io' })).status, 400);
  await call(admin, 'POST', `/admin/ambassadors/${agencyId}`, { account_email: 'alpha-staff@test.io' });
  const staffAp = await call(null, 'POST', '/auth/register', { email: 'alpha-staff@test.io', password: 'password123', role: 'aupair', name: 'Staff Signup', country: 'ZW', ref_code: 'alpha-zw' });
  await call(staffAp.body.token, 'POST', '/auth/verify-email', { code: lastCode('alpha-staff@test.io') });
  const still = (await call(admin, 'GET', `/admin/ambassadors/${agencyId}`)).body;
  assert.deepEqual([still.user_id, still.account_email, still.stats.aupairs], [null, 'alpha-staff@test.io', 2]);

  // An au pair who signed up without the code adds it from their account, once, and only an agency's code.
  const late = await register('aglate@test.io', 'aupair', 'ZW');
  assert.equal((await call(late.token, 'GET', `/users/${late.id}`)).body.user.agency, null);
  assert.equal((await call(late.token, 'POST', '/me/agency', { code: 'NOPE' })).status, 400);
  assert.equal((await call(late.token, 'POST', '/me/agency', { code: 'ANA-CO' })).status, 400, "an ambassador's code is not an agency");
  assert.deepEqual((await call(late.token, 'POST', '/me/agency', { code: ' alpha-zw ' })).body, { agency: 'Alpha Academy' });
  assert.equal((await call(fam.token, 'GET', `/users/${late.id}`)).body.user.agency, 'Alpha Academy');
  assert.equal((await call(late.token, 'POST', '/me/agency', { code: 'ALPHA-ZW' })).status, 400, 'already linked');
  // Families can join an agency's space too, but are never shown as an agency's.
  assert.deepEqual((await call(fam.token, 'POST', '/me/agency', { code: 'ALPHA-ZW' })).body, { agency: 'Alpha Academy' });
  assert.equal((await call(ap.token, 'GET', `/users/${fam.id}`)).body.user.agency, null);
});

test('flyer distributors: sessions the admin logs, family bonuses counted once from their areas, their own page, payouts', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  assert.equal((await call(admin, 'POST', '/admin/ambassadors', { code: 'BAD-AREA', name: 'X', kind: 'distributor', areas: 'door nacka!' })).status, 400);
  let r = await call(admin, 'POST', '/admin/ambassadors', { code: 'nils-d', name: 'Nils Svensson', country: 'se', kind: 'distributor', flyer_rate: '1', family_bonus: '50', areas: 'door-nacka, DOOR-BROMMA', bonus_days: 28 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id;
  assert.deepEqual([r.body.kind, r.body.flyer_rate, r.body.family_bonus, r.body.areas], ['distributor', 100, 5000, ['door-nacka', 'door-bromma']]);

  // Sessions: only in their areas, a whole number of flyers, on a day that has happened.
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${id}/sessions`, { area: 'door-taby', flyers: 500, delivered_on: day(-3) })).status, 400);
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${id}/sessions`, { area: 'door-nacka', flyers: 0, delivered_on: day(-3) })).status, 400);
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${id}/sessions`, { area: 'door-nacka', flyers: 500, delivered_on: day(2) })).status, 400);
  r = await call(admin, 'POST', `/admin/ambassadors/${id}/sessions`, { area: 'door-nacka', flyers: 500, delivered_on: day(-3), note: 'Spot-checked' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.stats.flyers, r.body.stats.flyers_ore, r.body.stats.families], [500, 50000, 0]);
  // Only distributors have sessions.
  const amb = testDb.prepare("SELECT id FROM ambassadors WHERE kind = 'ambassador' LIMIT 1").get().id;
  assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}/sessions`, { area: 'door-nacka', flyers: 5, delivered_on: day(-1) })).status, 400);

  // Families who come in through a Nacka flyer count, once each, whether on the waitlist, signed up, or both.
  await call(null, 'POST', '/waitlist', { email: 'nacka1@test.io', role: 'family', source: 'door-nacka' });
  await call(null, 'POST', '/waitlist', { email: 'nacka1@test.io', role: 'family', source: 'door-nacka' });
  await call(null, 'POST', '/auth/register', { email: 'NACKA1@test.io', password: 'password123', role: 'family', name: 'Familjen Ett', country: 'SE' });
  await call(null, 'POST', '/auth/register', { email: 'nacka2@test.io', password: 'password123', role: 'family', name: 'Familjen Två', country: 'SE', source: 'door-nacka' });
  // Au pairs, other areas, and families who joined before the session or after the bonus period don't.
  await call(null, 'POST', '/waitlist', { email: 'nacka-ap@test.io', role: 'aupair', source: 'door-nacka' });
  await call(null, 'POST', '/waitlist', { email: 'taby1@test.io', role: 'family', source: 'door-taby' });
  await call(null, 'POST', '/waitlist', { email: 'early@test.io', role: 'family', source: 'door-nacka' });
  testDb.prepare("UPDATE waitlist SET created_at = datetime('now', '-10 days') WHERE email = 'early@test.io'").run();
  await call(null, 'POST', '/waitlist', { email: 'bromma-late@test.io', role: 'family', source: 'door-bromma' });
  r = await call(admin, 'POST', `/admin/ambassadors/${id}/sessions`, { area: 'door-bromma', flyers: 300, delivered_on: day(-40) });
  let a = (await call(admin, 'GET', `/admin/ambassadors/${id}`)).body;
  assert.deepEqual(a.bonuses.map((b) => b.email).sort(), ['nacka1@test.io', 'nacka2@test.io']);
  assert.equal(a.bonuses.find((b) => b.email === 'nacka2@test.io').user_name, 'Familjen Två');
  assert.deepEqual([a.stats.sessions, a.stats.flyers, a.stats.families, a.stats.earned_ore, a.stats.owed_ore], [2, 800, 2, 90000, 90000]);
  assert.equal(a.sessions.find((s) => s.area === 'door-nacka').families, 2);

  // A distributor's code earns no ambassador rewards, and they're left off the dollar payout sheet.
  const ref = await call(null, 'POST', '/auth/register', { email: 'nilsref@test.io', password: 'password123', role: 'family', name: 'Ref', country: 'SE', ref_code: 'NILS-D' });
  assert.equal(ref.status, 201);
  assert.equal(testDb.prepare('SELECT COUNT(*) n FROM referral_rewards WHERE ambassador_id = ?').get(id).n, 0);
  const csv = await (await fetch(`${base}/admin/ambassadors.csv`, { headers: { Authorization: `Bearer ${admin}` } })).text();
  assert.ok(!csv.includes('NILS-D'));

  // Invited before he has an account: the email sends him to the ambassador sign-up page, worded for flyers.
  await call(admin, 'POST', `/admin/ambassadors/${id}`, { account_email: 'nils@test.io' });
  const invite = outbox.findLast((m) => m.to === 'nils@test.io');
  assert.match(invite.subject, /flyer delivery page/);
  assert.match(invite.text, /#\/ambassador-signup\?for=flyers&email=nils%40test\.io/);
  // Nils sees his own page: sessions and pay, not who the families are.
  const nils = await register('nils@test.io', 'ambassador', 'SE', 'Nils Svensson', { complete: false });
  assert.deepEqual((await call(nils.token, 'GET', '/me')).body.ambassador, { code: 'NILS-D', kind: 'distributor' });
  const mine = (await call(nils.token, 'GET', '/me/ambassador')).body;
  assert.equal(mine.kind, 'distributor');
  assert.deepEqual(mine.rates, { flyer_ore: 100, family_ore: 5000, bonus_days: 28 });
  assert.deepEqual([mine.total.flyers, mine.total.families, mine.total.earned_ore], [800, 2, 90000]);
  assert.equal(mine.sessions.length, 2);
  assert.ok(!JSON.stringify(mine).includes('nacka1@test.io'));
  assert.ok(testDb.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE '%flyer delivery page%'").get(nils.id));

  // A new rate applies to new sessions only. Paying marks sessions and bonuses paid; paid sessions can't be removed.
  await call(admin, 'POST', `/admin/ambassadors/${id}`, { flyer_rate: '1,50' });
  r = await call(admin, 'POST', `/admin/ambassadors/${id}/paid`, {});
  assert.equal(r.body.marked, 4);
  assert.equal(r.body.stats.owed_ore, 0);
  // A new Bromma session at 1.50 kr a flyer also covers the family who joined Bromma's waitlist today, and the next one.
  r = await call(admin, 'POST', `/admin/ambassadors/${id}/sessions`, { area: 'door-bromma', flyers: 100, delivered_on: day(0) });
  assert.equal(r.body.stats.owed_ore, 15000 + 5000);
  const paidSession = r.body.sessions.find((s) => s.paid_at).id;
  assert.equal((await call(admin, 'DELETE', `/admin/ambassadors/${id}/sessions/${paidSession}`)).status, 400);
  await call(null, 'POST', '/waitlist', { email: 'bromma2@test.io', role: 'family', source: 'door-bromma' });
  a = (await call(admin, 'GET', `/admin/ambassadors/${id}`)).body;
  assert.equal(a.stats.owed_ore, 15000 + 5000 + 5000);
  r = await call(admin, 'DELETE', `/admin/ambassadors/${id}/sessions/${a.sessions[0].id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.stats.owed_ore, 0);
  assert.equal((await call(nils.token, 'POST', `/admin/ambassadors/${id}/sessions`, { area: 'door-nacka', flyers: 5, delivered_on: day(0) })).status, 403);
});

test('agency accounts: own sign-up, hidden from members, linked to a code by the admin, then see their numbers', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;

  const res = await call(null, 'POST', '/auth/register', { email: 'dtall@agency.test', password: 'password123', role: 'agency', name: 'Bright Start Agency', country: 'ZW', ref_code: 'NOT-CHECKED' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const ag = { token: res.body.token, id: res.body.user.id };
  await call(ag.token, 'POST', '/auth/verify-email', { code: lastCode('dtall@agency.test') });
  let me = (await call(ag.token, 'GET', '/me')).body;
  assert.equal(me.user.role, 'agency');
  assert.equal(me.profile ?? null, null);
  assert.deepEqual(me.profile_missing, []);
  assert.equal(me.ambassador, null);
  assert.equal(testDb.prepare('SELECT ref_code FROM users WHERE id = ?').get(ag.id).ref_code, null, 'an agency is nobody\'s referral');
  // Members can't search, like or be found by an agency account.
  assert.equal((await call(ag.token, 'GET', '/discover')).status, 403);
  const fam = await register('agacct-fam@test.io', 'family', 'SE');
  assert.ok(!(await call(fam.token, 'GET', '/search?q=Bright')).body.results?.some((u) => u.id === ag.id));
  // The admin is told, and sees it waiting for a code.
  const adminId = testDb.prepare("SELECT id FROM users WHERE email = 'admin@test.io'").get().id;
  assert.ok(testDb.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE '%Bright Start Agency%'").get(adminId));
  let list = (await call(admin, 'GET', '/admin/ambassadors')).body;
  assert.ok(list.partner_accounts.some((u) => u.email === 'dtall@agency.test'));

  // Linking it to the agency's code takes it off the waiting list, tells the agency, and shows its numbers.
  const r = await call(admin, 'POST', '/admin/ambassadors', { code: 'BRIGHT', name: 'Bright Start Agency', kind: 'agency', account_email: 'DTALL@agency.test' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  list = (await call(admin, 'GET', '/admin/ambassadors')).body;
  assert.ok(!list.partner_accounts.some((u) => u.email === 'dtall@agency.test'));
  assert.ok(testDb.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE '%BRIGHT%'").get(ag.id));
  const ap = await call(null, 'POST', '/auth/register', { email: 'bright-ap@test.io', password: 'password123', role: 'aupair', name: 'Tendai Moyo', country: 'ZW', ref_code: 'bright' });
  assert.equal(ap.status, 201);
  me = (await call(ag.token, 'GET', '/me')).body;
  assert.deepEqual(me.ambassador, { code: 'BRIGHT', kind: 'agency' });
  const mine = (await call(ag.token, 'GET', '/me/ambassador')).body;
  assert.equal(mine.kind, 'agency');
  assert.equal(mine.rewards, undefined, 'agencies see no rewards');
  assert.deepEqual(mine.total, { aupairs: 1, profiles: 0, verified: 0, placements: 0 });
});

test('ambassador accounts: anyone can sign up without being an au pair or family, and earns once linked to a code', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  const adminId = testDb.prepare("SELECT id FROM users WHERE email = 'admin@test.io'").get().id;

  const res = await call(null, 'POST', '/auth/register', { email: 'coach@school.test', password: 'password123', role: 'ambassador', name: 'Lena Berg', country: 'SE', ref_code: 'NOT-CHECKED' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const amb = { token: res.body.token, id: res.body.user.id };
  await call(amb.token, 'POST', '/auth/verify-email', { code: lastCode('coach@school.test') });
  let me = (await call(amb.token, 'GET', '/me')).body;
  assert.equal(me.user.role, 'ambassador');
  assert.equal(me.profile ?? null, null);
  assert.deepEqual(me.profile_missing, []);
  assert.equal(me.ambassador, null);
  assert.equal(testDb.prepare('SELECT ref_code FROM users WHERE id = ?').get(amb.id).ref_code, null);
  assert.equal((await call(amb.token, 'GET', '/discover')).status, 403);
  const fam = await register('ambacct-fam@test.io', 'family', 'SE');
  assert.ok(!(await call(fam.token, 'GET', '/search?q=Lena')).body.results?.some((u) => u.id === amb.id));
  assert.ok(testDb.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE 'New ambassador account: Lena Berg%'").get(adminId));
  let list = (await call(admin, 'GET', '/admin/ambassadors')).body;
  assert.equal(list.partner_accounts.find((u) => u.email === 'coach@school.test')?.role, 'ambassador');

  // Linking it to a code tells them, and families who join with it earn them a reward like any ambassador.
  const r = await call(admin, 'POST', '/admin/ambassadors', { code: 'LENA-SE', name: 'Lena Berg', account_email: 'coach@school.test' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  list = (await call(admin, 'GET', '/admin/ambassadors')).body;
  assert.ok(!list.partner_accounts.some((u) => u.email === 'coach@school.test'));
  assert.ok(testDb.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE '%ambassador code LENA-SE%'").get(amb.id));
  const joined = await call(null, 'POST', '/auth/register', { email: 'lena-fam@test.io', password: 'password123', role: 'family', name: 'Familjen Ek', country: 'SE', ref_code: 'lena-se' });
  assert.equal(joined.status, 201);
  me = (await call(amb.token, 'GET', '/me')).body;
  assert.deepEqual(me.ambassador, { code: 'LENA-SE', kind: 'ambassador' });
  const mine = (await call(amb.token, 'GET', '/me/ambassador')).body;
  assert.equal(mine.kind, 'ambassador');
  assert.ok(mine.rewards.pass > 0);
  assert.equal(mine.total.families, 1);
});

test('ambassador accounts: a database from before them gets the wider role check', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const file = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-mig-') + '/old.db';
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('aupair','family','admin','agency')), name TEXT NOT NULL)`);
  old.close();
  const db = openDb(file);
  db.prepare("INSERT INTO users (email, password_hash, role, name) VALUES ('m@test.io', 'x', 'ambassador', 'M')").run();
  assert.throws(() => db.prepare("INSERT INTO users (email, password_hash, role, name) VALUES ('n@test.io', 'x', 'nobody', 'N')").run());
  db.close();
});

test('agency invites: a code saved with an email that has no account invites them, and links once they confirm it', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  const adminId = testDb.prepare("SELECT id FROM users WHERE email = 'admin@test.io'").get().id;

  let r = await call(admin, 'POST', '/admin/ambassadors', { code: 'SUNRISE', name: 'Sunrise Au Pairs', kind: 'agency', account_email: ' Boss@Sunrise.test ' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id;
  assert.deepEqual([r.body.invite_email, r.body.account_email, r.body.user_id], ['boss@sunrise.test', 'boss@sunrise.test', null]);
  const invites = () => outbox.filter((m) => m.to === 'boss@sunrise.test' && /agency account/.test(m.subject));
  await new Promise((done) => setImmediate(done));
  assert.equal(invites().length, 1);
  assert.match(invites()[0].text, /SUNRISE/);
  assert.match(invites()[0].text, /https:\/\/pairmundo\.com\/#\/agency-signup\?email=boss%40sunrise\.test/);
  // Saving the form again doesn't send it twice; asking to resend does.
  await call(admin, 'POST', `/admin/ambassadors/${id}`, { name: 'Sunrise Au Pairs', account_email: 'boss@sunrise.test' });
  await call(admin, 'POST', `/admin/ambassadors/${id}?resend=1`, {});
  await new Promise((done) => setImmediate(done));
  assert.equal(invites().length, 2);

  // Signing up doesn't link it until the email is confirmed, and the admin isn't asked to link it by hand.
  const notes = () => testDb.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND text LIKE '%Sunrise%'").get(adminId).n;
  const before = notes();
  const reg = await call(null, 'POST', '/auth/register', { email: 'boss@sunrise.test', password: 'password123', role: 'agency', name: 'Sunrise Au Pairs', country: 'KE' });
  assert.equal(reg.status, 201);
  assert.equal(notes(), before);
  assert.equal((await call(reg.body.token, 'GET', '/me')).body.ambassador, null);
  await call(reg.body.token, 'POST', '/auth/verify-email', { code: lastCode('boss@sunrise.test') });
  assert.deepEqual((await call(reg.body.token, 'GET', '/me')).body.ambassador, { code: 'SUNRISE', kind: 'agency' });
  assert.ok(testDb.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE '%SUNRISE%'").get(reg.body.user.id));
  r = (await call(admin, 'GET', `/admin/ambassadors/${id}`)).body;
  assert.deepEqual([r.invite_email, r.user_id, r.account_email], [null, reg.body.user.id, 'boss@sunrise.test']);
  assert.ok(!(await call(admin, 'GET', '/admin/ambassadors')).body.partner_accounts.some((u) => u.email === 'boss@sunrise.test'));
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
  assert.match(join.body.url, /^https:\/\/meet\.jit\.si\/PairMundo-[0-9a-f]{24}#userInfo\.displayName=.*&config\.disableDeepLinking=true$/);
  assert.equal(join.body.in_app, false);
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

test('au pair agreement and country paperwork: Sweden, au pair from outside the EU', async () => {
  const fam = await register('agreefam@test.io', 'family', 'SE', 'Familjen Berg');
  const ap = await register('agreeap@test.io', 'aupair', 'PH', 'Joy Santos');
  await call(ap.token, 'PUT', '/me', { profile: { birth_date: '2002-03-03', nationality: 'PH' } });
  const req = await call(fam.token, 'POST', '/requests', { to_user: ap.id });
  await call(ap.token, 'POST', `/requests/${req.body.id}/respond`, { action: 'accept' });
  const r = await call(fam.token, 'POST', '/placements', { other_user_id: ap.id, start_date: '2027-03-01', end_date: '2027-12-31', weekly_hours: 25, pocket_money: 5960 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const pid = r.body.id;
  let p = (await call(ap.token, 'GET', `/placements/${pid}`)).body;
  // Sweden's three permit steps replace the generic visa step, each linking to Migrationsverket.
  const titles = p.tasks.map((t) => t.title);
  assert.ok(titles.includes('Apply online to Migrationsverket for the work permit for au pairs'));
  assert.ok(!titles.includes('Apply for visa or residence permit'));
  assert.equal(p.tasks.length, 12);
  assert.match(p.tasks.find((t) => t.title.startsWith('Apply online')).link, /migrationsverket/);
  assert.equal(p.agreement, null);
  assert.equal((await call(ap.token, 'GET', `/placements/${pid}/agreement`)).status, 400);

  await call(ap.token, 'POST', `/placements/${pid}/confirm`);
  let a = (await call(fam.token, 'GET', `/placements/${pid}/agreement`)).body;
  assert.deepEqual(a.missing, ['days_off', 'paid_leave_weeks']);
  assert.equal(a.my_side, 'family');
  assert.ok(a.sections.some((s) => s.clauses?.some(([text, vars]) => text.includes('{hours} hours a week') && vars.hours === 25)));
  assert.equal((await call(fam.token, 'POST', `/placements/${pid}/agreement/sign`, { name: 'Erik Berg' })).status, 400);
  assert.equal((await call(fam.token, 'PUT', `/placements/${pid}/agreement`, { terms: { days_off: 9 } })).status, 400);
  a = (await call(fam.token, 'PUT', `/placements/${pid}/agreement`, { terms: { days_off: 2, paid_leave_weeks: 2, house_rules: 'No phones at dinner.' } })).body;
  assert.deepEqual(a.missing, []);
  assert.ok(a.sections.some((s) => s.text === 'No phones at dinner.'));

  a = (await call(fam.token, 'POST', `/placements/${pid}/agreement/sign`, { name: 'Erik Berg' })).body;
  assert.equal(a.signatures.family.name, 'Erik Berg');
  assert.equal((await call(fam.token, 'POST', `/placements/${pid}/agreement/sign`, { name: 'Erik Berg' })).status, 409);
  // Changing the terms after signing clears the signature.
  a = (await call(ap.token, 'PUT', `/placements/${pid}/agreement`, { terms: { paid_leave_weeks: 3 } })).body;
  assert.equal(a.signatures.family, null);
  await call(fam.token, 'POST', `/placements/${pid}/agreement/sign`, { name: 'Erik Berg' });
  a = (await call(ap.token, 'POST', `/placements/${pid}/agreement/sign`, { name: 'Joy Santos' })).body;
  assert.ok(a.signatures.aupair && a.signatures.family);
  p = (await call(ap.token, 'GET', `/placements/${pid}`)).body;
  assert.equal(p.tasks.find((t) => t.title === 'Sign au pair agreement / contract').done, 1);
  assert.ok(p.agreement.aupair_signed_at && p.agreement.family_signed_at);
  const stranger = await register('agreestranger@test.io', 'family', 'SE');
  assert.equal((await call(stranger.token, 'GET', `/placements/${pid}/agreement`)).status, 404);
});

test('certificate checks: an au pair sends proof, an admin checks it, the file is deleted', async () => {
  const ap = await register('proofap@test.io', 'aupair', 'PL', 'Proof Aupair');
  const fam = await register('prooffam@test.io', 'family', 'SE', 'Familjen Proof');
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  const png = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000', 'hex').toString('base64')}`;
  assert.equal((await call(ap.token, 'POST', '/me/certificates/cpr/proof', { data_url: png })).status, 400);
  await call(ap.token, 'PUT', '/me', { profile: { certificates: [{ kind: 'cpr', detail: 'Red Cross' }, { kind: 'language', detail: 'IELTS 7' }] } });
  assert.equal((await call(ap.token, 'POST', '/me/certificates/cpr/proof', { data_url: 'data:image/png;base64,aGVsbG8=' })).status, 400);
  let r = await call(ap.token, 'POST', '/me/certificates/cpr/proof', { data_url: png });
  assert.equal(r.body.proof.status, 'pending');
  assert.equal((await call(fam.token, 'GET', '/admin/certificates')).status, 403);
  const queue = (await call(admin, 'GET', '/admin/certificates')).body.proofs.filter((p) => p.user_id === ap.id);
  assert.deepEqual(queue.map((p) => [p.kind, p.detail]), [['cpr', 'Red Cross']]);
  const file = await fetch(`${base}/admin/certificates/${ap.id}/cpr/file`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal((await call(admin, 'POST', `/admin/certificates/${ap.id}/cpr`, { status: 'verified' })).status, 200);
  assert.equal((await fetch(`${base}/admin/certificates/${ap.id}/cpr/file`, { headers: { Authorization: `Bearer ${admin}` } })).status, 404);
  r = await call(fam.token, 'GET', `/users/${ap.id}`);
  assert.deepEqual(r.body.profile.certificates.map((c) => [c.kind, c.verified]), [['cpr', true], ['language', false]]);
  // Changing what the certificate says takes the check away.
  await call(ap.token, 'PUT', '/me', { profile: { certificates: [{ kind: 'cpr', detail: 'Something else' }] } });
  r = await call(fam.token, 'GET', `/users/${ap.id}`);
  assert.equal(r.body.profile.certificates[0].verified, false);
});

test('references: an au pair enters a past family email, the family makes an account from the link and reviews', async () => {
  const ap = await register('referenceap@test.io', 'aupair', 'PL', 'Ref Aupair');
  const fam = await register('referencefam@test.io', 'family', 'SE', 'Familjen Ref');
  assert.equal((await call(ap.token, 'POST', '/me/references', { email: 'referenceap@test.io' })).status, 400);
  assert.equal((await call(fam.token, 'POST', '/me/references', { email: 'x@test.io' })).status, 403);
  // The email is all the au pair needs to give.
  let r = await call(ap.token, 'POST', '/me/references', { email: 'Ewa@Test.io' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.reference.status, 'sent');
  assert.equal((await call(ap.token, 'POST', '/me/references', { email: 'ewa@test.io' })).status, 400);
  const mail = outbox.find((m) => m.to === 'ewa@test.io');
  assert.match(mail.text, /free PairMundo account/);
  const token = mail.text.match(/#\/reference\/([\w-]+)/)[1];
  r = await call(null, 'GET', `/references/${token}`);
  assert.deepEqual([r.body.aupair.first_name, r.body.email, r.body.has_account, r.body.signed_in], ['Ref', 'ewa@test.io', false, false]);
  // No review without an account on the invited email.
  assert.equal((await call(null, 'POST', `/references/${token}`, { months: 18, rating: 5, recommend: true })).status, 401);
  assert.equal((await call(fam.token, 'POST', `/references/${token}`, { months: 18, rating: 5, recommend: true })).status, 403);
  // The family makes a host family account from the link; opening it proved the email, so no code is needed.
  assert.equal((await call(null, 'POST', `/references/${token}/account`, { name: 'Ewa', password: 'short' })).status, 400);
  r = await call(null, 'POST', `/references/${token}/account`, { name: 'Ewa Nowak', password: 'password123', country: 'pl' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const ewa = r.body;
  assert.deepEqual([ewa.user.role, ewa.user.email, ewa.user.email_verified], ['family', 'ewa@test.io', true]);
  assert.equal(testDb.prepare('SELECT source FROM users WHERE id = ?').get(ewa.user.id).source, 'reference');
  assert.equal((await call(null, 'POST', `/references/${token}/account`, { name: 'Ewa', password: 'password123' })).status, 409);
  assert.equal((await call(ewa.token, 'GET', `/references/${token}`)).body.signed_in, true);
  assert.equal((await call(ewa.token, 'POST', `/references/${token}`, { months: 0, rating: 5, recommend: true })).status, 400);
  r = await call(ewa.token, 'POST', `/references/${token}`, { months: 18, rating: 5, recommend: true, age_groups: ['toddler', 'nope'], comment: 'Wonderful with our son.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call(ewa.token, 'POST', `/references/${token}`, { months: 18, rating: 5, recommend: true })).status, 409);
  assert.equal((await call(ap.token, 'GET', '/me/references')).body.references[0].name, 'Ewa Nowak');
  r = await call(fam.token, 'GET', `/users/${ap.id}`);
  assert.equal(r.body.user.verification.references, true);
  assert.deepEqual(r.body.references.map((x) => [x.name, x.verified, x.months, x.recommend, x.age_groups]), [['Ewa', true, 18, true, ['toddler']]]);
  assert.ok(!JSON.stringify(r.body.references).includes('ewa@test.io'));
  // Past-family references stay apart from placement reviews.
  assert.deepEqual(r.body.reviews, []);
  // Removing the only confirmed reference takes the badge away again.
  await call(ap.token, 'DELETE', `/me/references/${r.body.references[0].id}`);
  assert.equal((await call(fam.token, 'GET', `/users/${ap.id}`)).body.user.verification.references, false);
});

test('references: a family who already has an account signs in to review, and anyone can say they do not know the au pair', async () => {
  const ap = await register('referenceap2@test.io', 'aupair', 'PL', 'Lena Ap');
  const fam = await register('pastfam@test.io', 'family', 'DE', 'Familie Weber');
  await call(ap.token, 'POST', '/me/references', { email: 'pastfam@test.io', relation: 'Munich, 2024' });
  await call(ap.token, 'POST', '/me/references', { email: 'stranger@test.io' });
  const tokenFor = (to) => outbox.filter((m) => m.to === to).at(-1).text.match(/#\/reference\/([\w-]+)/)[1];
  let r = await call(null, 'GET', `/references/${tokenFor('pastfam@test.io')}`);
  assert.equal(r.body.has_account, true);
  assert.equal((await call(null, 'POST', `/references/${tokenFor('pastfam@test.io')}/account`, { name: 'X', password: 'password123' })).status, 409);
  r = await call(fam.token, 'POST', `/references/${tokenFor('pastfam@test.io')}`, { months: 10, rating: 4, recommend: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call(null, 'POST', `/references/${tokenFor('stranger@test.io')}`, { knows: false })).body.status, 'declined');
  r = await call(fam.token, 'GET', `/users/${ap.id}`);
  assert.deepEqual(r.body.references.map((x) => [x.name, x.relation, x.verified]), [['Familie', 'Munich, 2024', true]]);
});

test('early family bonus: first families before launch get free days to use when they choose, while spots last', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin3@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin3@test.io', password: 'password123' })).body.token;
  const join = (body) => fetch(`${base}/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    // Leave room for exactly two more families.
    const taken = testDb.prepare('SELECT COUNT(*) n FROM early_bonus').get().n;
    process.env.EARLY_FAMILY_CAP = String(taken + 2);
    let offer = (await call(null, 'GET', '/early-family-offer')).body;
    assert.deepEqual([offer.open, offer.days, offer.spots_left], [true, 30, 2]);

    // A family on the waitlist keeps a spot, hears about it by email, and gets it when they sign up later.
    await join({ email: 'earlywait@test.io', role: 'family' });
    assert.match(outbox.at(-1).text, /30 extra free days/);
    await join({ email: 'earlyap@test.io', role: 'aupair' });
    assert.doesNotMatch(outbox.at(-1).text, /extra free days/);
    const fam = await register('earlyfam@test.io', 'family', 'SE');
    assert.equal((await call(null, 'GET', '/early-family-offer')).body.open, false, 'the spots are gone');
    const late = await register('latefam@test.io', 'family', 'SE');
    assert.equal((await call(late.token, 'GET', '/family-pass')).body.early_bonus, null);
    const waited = await register('earlywait@test.io', 'family', 'SE');
    let pass = (await call(waited.token, 'GET', '/family-pass')).body;
    assert.equal(pass.early_bonus.days, 30);
    assert.equal(pass.early_bonus.redeemed, false);
    assert.equal(pass.early_bonus.use_by, null, 'no deadline before a launch date is set');

    // While everything is free, the days stay saved.
    pass = (await call(fam.token, 'GET', '/family-pass')).body;
    assert.equal(pass.early_bonus.can_redeem, false);
    assert.equal((await call(fam.token, 'POST', '/family-pass/early-bonus')).status, 409);

    // After launch nobody new gets a spot, and the bonus can be used for 12 months.
    process.env.FAMILY_PASS = 'on';
    process.env.EARLY_FAMILY_CAP = '100000';
    process.env.LAUNCH_DATE = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    assert.equal((await call(null, 'GET', '/early-family-offer')).body.open, false);
    const after = await register('afterlaunch@test.io', 'family', 'SE');
    assert.equal((await call(after.token, 'GET', '/family-pass')).body.early_bonus, null);
    pass = (await call(fam.token, 'GET', '/family-pass')).body;
    assert.equal(pass.early_bonus.can_redeem, true);
    assert.equal(pass.active, false);
    assert.ok(pass.early_bonus.use_by > process.env.LAUNCH_DATE);
    // Using it starts 30 days of the pass now, once.
    let r = await call(fam.token, 'POST', '/family-pass/early-bonus');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.active, true);
    assert.equal(r.body.early, true);
    assert.equal(r.body.early_bonus.redeemed, true);
    assert.ok(Math.abs(new Date(r.body.ends_at.replace(' ', 'T') + 'Z') - Date.now() - 30 * 86400000) < 120000);
    assert.equal((await call(fam.token, 'POST', '/family-pass/early-bonus')).status, 409);
    assert.equal((await call(late.token, 'POST', '/family-pass/early-bonus')).status, 404);
    // Free days earn no ambassador reward and show in Admin.
    assert.equal(testDb.prepare("SELECT COUNT(*) n FROM referral_rewards WHERE user_id = ? AND kind = 'pass'").get(fam.id).n, 0);
    const w = (await call(admin, 'GET', '/admin/waitlist')).body.early_bonus;
    assert.equal(w.redeemed, 1);
    assert.equal(w.open, false);

    // Twelve months after launch, an unused bonus can't be used any more.
    process.env.LAUNCH_DATE = '2020-01-01';
    pass = (await call(waited.token, 'GET', '/family-pass')).body;
    assert.equal(pass.early_bonus.expired, true);
    assert.equal((await call(waited.token, 'POST', '/family-pass/early-bonus')).status, 410);
  } finally { for (const k of ['EARLY_FAMILY_CAP', 'LAUNCH_DATE', 'FAMILY_PASS']) delete process.env[k]; }
});

test('gift days: an ambassador code gives families free days to use within 12 months, never on top of the early bonus', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin4@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin4@test.io', password: 'password123' })).body.token;
  const regRef = async (email, role, code) => {
    const res = await call(null, 'POST', '/auth/register', { email, password: 'password123', role, name: email, country: 'SE', ref_code: code });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    await call(res.body.token, 'POST', '/auth/verify-email', { code: lastCode(email) });
    return { token: res.body.token, id: res.body.user.id };
  };
  const gifts = () => testDb.prepare('SELECT COUNT(*) n FROM ref_gifts').get().n;
  try {
    // The admin sets the gift days on a code, from 0 to 365.
    let r = await call(admin, 'POST', '/admin/ambassadors', { code: 'HOME-SE', name: 'Södermalm Homes', gift_days: '30' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const amb = r.body.id;
    assert.equal(r.body.gift_days, 30);
    assert.equal((await call(admin, 'POST', '/admin/ambassadors', { code: 'HOME-X', name: 'Too many', gift_days: 400 })).status, 400);
    assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}`, { gift_days: 'lots' })).status, 400);
    assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}`, { gift_days: 0 })).body.gift_days, 0);
    assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}`, { gift_days: 30 })).body.gift_days, 30);
    assert.equal((await call(admin, 'GET', '/admin/ambassadors')).body.ambassadors.find((a) => a.id === amb).gift_days, 30);
    assert.equal((await call(admin, 'POST', '/admin/ambassadors', { code: 'NOGIFT-SE', name: 'No Gift' })).body.gift_days, 0);

    // No double bonus: a family who gets the early family bonus keeps just that.
    const early = await regRef('giftearly@test.io', 'family', 'HOME-SE');
    let pass = (await call(early.token, 'GET', '/family-pass')).body;
    assert.ok(pass.early_bonus);
    assert.equal(pass.gift, null);
    assert.equal(gifts(), 0);

    // Once the early bonus is closed, a family signing up with the code gets its days saved, fixed at sign-up.
    process.env.EARLY_FAMILY_CAP = '0';
    const fam = await regRef('giftfam@test.io', 'family', 'home-se');
    assert.equal((await call(admin, 'POST', `/admin/ambassadors/${amb}`, { gift_days: 45 })).status, 200);
    pass = (await call(fam.token, 'GET', '/family-pass')).body;
    assert.equal(pass.early_bonus, null);
    assert.deepEqual([pass.gift.days, pass.gift.from, pass.gift.redeemed, pass.gift.expired], [30, 'Södermalm Homes', false, false]);
    assert.ok(pass.gift.use_by > new Date(Date.now() + 360 * 86400000).toISOString().slice(0, 10));
    await call(admin, 'POST', `/admin/ambassadors/${amb}`, { gift_days: 30 });
    // Au pairs and codes without gift days get nothing.
    const ap = await regRef('giftap@test.io', 'aupair', 'HOME-SE');
    const plain = await regRef('giftplain@test.io', 'family', 'NOGIFT-SE');
    assert.equal((await call(plain.token, 'GET', '/family-pass')).body.gift, null);
    assert.equal(gifts(), 1);

    // While everything is free, the days stay saved.
    assert.equal(pass.gift.can_redeem, false);
    assert.equal((await call(fam.token, 'POST', '/family-pass/gift')).status, 409);

    // The pass-ended reminder says the gift is still there.
    process.env.FAMILY_PASS = 'on';
    testDb.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?, 'admin', NULL, datetime('now', '-30 days'), datetime('now', '-1 hours'))").run(fam.id);
    assert.equal(app.sendPassReminders(), 1);
    assert.match(outbox.filter((m) => m.to === 'giftfam@test.io').at(-1).subject, /30 free days saved, a gift from Södermalm Homes/);

    // Using it starts the days now, once, and earns the ambassador nothing (it's not a paid pass).
    r = await call(fam.token, 'POST', '/family-pass/gift');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.active, r.body.gift_active, r.body.early, r.body.gift.redeemed], [true, true, false, true]);
    assert.ok(Math.abs(new Date(r.body.ends_at.replace(' ', 'T') + 'Z') - Date.now() - 30 * 86400000) < 120000);
    assert.equal(testDb.prepare("SELECT source FROM passes WHERE user_id = ? ORDER BY id DESC").get(fam.id).source, 'gift');
    assert.equal((await call(fam.token, 'POST', '/family-pass/gift')).status, 409);
    assert.equal((await call(plain.token, 'POST', '/family-pass/gift')).status, 404);
    assert.equal((await call(ap.token, 'POST', '/family-pass/gift')).status, 403);
    assert.equal(testDb.prepare("SELECT COUNT(*) n FROM referral_rewards WHERE user_id = ? AND kind = 'pass'").get(fam.id).n, 0);
    assert.deepEqual({ ...(await call(admin, 'GET', `/admin/ambassadors/${amb}`)).body.gifts }, { saved: 1, redeemed: 1 });
    assert.deepEqual({ ...(await call(admin, 'GET', '/admin/waitlist')).body.gifts }, { saved: 1, redeemed: 1 });

    // A used gift stays with the email: deleting the account and signing up again with the code gives no new one.
    assert.equal((await call(fam.token, 'DELETE', '/me', { password: 'password123' })).status, 200);
    const again = await regRef('giftfam@test.io', 'family', 'HOME-SE');
    pass = (await call(again.token, 'GET', '/family-pass')).body;
    assert.equal(pass.gift.redeemed, true);
    assert.equal((await call(again.token, 'POST', '/family-pass/gift')).status, 409);
    assert.equal(gifts(), 1);

    // Twelve months after signing up, an unused gift can't be used any more.
    const late = await regRef('giftlate@test.io', 'family', 'HOME-SE');
    testDb.prepare("UPDATE ref_gifts SET created_at = datetime('now', '-12 months', '-1 days') WHERE user_id = ?").run(late.id);
    pass = (await call(late.token, 'GET', '/family-pass')).body;
    assert.deepEqual([pass.gift.expired, pass.gift.can_redeem], [true, false]);
    assert.equal((await call(late.token, 'POST', '/family-pass/gift')).status, 410);
  } finally { for (const k of ['EARLY_FAMILY_CAP', 'FAMILY_PASS']) delete process.env[k]; }
});

test('babysitter question: a family answers in onboarding, only they and admins see it', async () => {
  const fam = await register('sitter-fam@test.io', 'family', 'SE', 'Familjen Sitter');
  const ap = await register('sitter-ap@test.io', 'aupair', 'ES', 'Lucia Sitter');
  assert.equal((await call(fam.token, 'GET', '/me')).body.profile.wants_sitter, null);
  assert.equal((await call(fam.token, 'PUT', '/me', { profile: { wants_sitter: 'sometimes' } })).status, 400);
  const r = await call(fam.token, 'PUT', '/me', { profile: { bio: 'We live in Stockholm.', wants_sitter: 'yes' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.wants_sitter, 'yes');
  assert.equal((await call(fam.token, 'GET', '/me')).body.profile.wants_sitter, 'yes');
  // Au pairs never see the answer.
  assert.equal('wants_sitter' in (await call(ap.token, 'GET', `/users/${fam.id}`)).body.profile, false);
  // Admins see the totals on the overview.
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  const s = (await call(admin, 'GET', '/admin/stats')).body.sitter_interest;
  assert.ok(s.yes >= 1);
  assert.deepEqual(Object.keys(s), ['yes', 'maybe', 'no', 'unanswered']);
  // Clearing the answer is allowed.
  assert.equal((await call(fam.token, 'PUT', '/me', { profile: { wants_sitter: null } })).body.profile.wants_sitter, null);
});

test('launch email: only when pressed on launch day, once per person, in their language, picks up after a failure', async () => {
  const db2 = openDb(':memory:');
  const box = []; let failAt = null;
  const mailer = async (m) => { if (m.to === failAt) throw new Error('Email send failed (429): rate limited'); box.push(m); };
  process.env.LAUNCH_EMAIL_GAP_MS = '0';
  process.env.LAUNCH_DATE = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const app2 = createApp(db2, { mailer, pusher: async (m) => m.map(() => ({ status: 'ok' })) });
  const srv = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  const call2 = async (token, method, path, body, headers = {}) => {
    const res = await fetch(b2 + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const reg = async (email, role, lang = 'en') => (await call2(null, 'POST', '/auth/register', { email, password: 'password123', role, name: email, country: 'DE' }, { 'Accept-Language': lang })).body;
  try {
    // Before launch: a family on the waitlist and a family with an account both save early free days.
    await call2(null, 'POST', '/waitlist', { email: 'wl-fam@test.io', role: 'family' }, { 'Accept-Language': 'es' });
    await call2(null, 'POST', '/waitlist', { email: 'wl-ap@test.io', role: 'aupair' });
    await call2(null, 'POST', '/waitlist', { email: 'both@test.io', role: 'family' });
    await call2(null, 'POST', '/waitlist', { email: 'someone@test.io' });
    const fam = await reg('acc-fam@test.io', 'family', 'de');
    await reg('acc-ap@test.io', 'aupair');
    await reg('both@test.io', 'family');
    await reg('unverified@test.io', 'aupair');
    await reg('banned@test.io', 'aupair');
    db2.prepare("UPDATE users SET email_verified = 1 WHERE email != 'unverified@test.io'").run();
    db2.prepare("UPDATE users SET suspended = 1 WHERE email = 'banned@test.io'").run();
    const { hashPassword } = await import('../server/auth.js');
    db2.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES ('boss@test.io', ?, 'admin', 'Boss', 1)").run(hashPassword('password123'));
    const admin = (await call2(null, 'POST', '/auth/login', { email: 'boss@test.io', password: 'password123' })).body.token;
    const before = box.length;

    assert.equal((await call2(fam.token, 'GET', '/admin/launch-email')).status, 403);
    let l = (await call2(admin, 'GET', '/admin/launch-email')).body;
    // acc-fam, acc-ap, both (account) + wl-fam, wl-ap, someone; not the unverified, suspended or admin accounts.
    assert.equal(l.total, 6);
    assert.equal(l.remaining, 6);
    assert.deepEqual(l.breakdown, { families_with_account: 2, aupairs_with_account: 1, waitlist_families: 1, waitlist_aupairs: 1, waitlist_other: 1 });
    assert.equal(l.too_early, true);
    assert.equal(l.samples.length, 5);
    assert.match(l.samples[0].text, /30 free days/);

    // Samples go to the admin only; nothing goes out before launch day.
    assert.equal((await call2(admin, 'POST', '/admin/launch-email/test')).body.count, 5);
    assert.ok(box.slice(before).every((m) => m.to === 'boss@test.io'));
    assert.equal((await call2(admin, 'POST', '/admin/launch-email/send', {})).status, 409);

    // Launch day. The third email fails, so the batch stops there.
    process.env.LAUNCH_DATE = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    process.env.APP_STORE_URL = 'https://apps.apple.com/app/id123';
    const start = box.length;
    failAt = 'both@test.io';
    let r = await call2(admin, 'POST', '/admin/launch-email/send', { limit: 100 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await app2.launchEmailRun;
    l = (await call2(admin, 'GET', '/admin/launch-email')).body;
    assert.equal(l.sent, 2);
    assert.match(l.job.error, /both@test\.io.*429/);
    const sent = box.slice(start);
    assert.deepEqual(sent.map((m) => m.to), ['acc-fam@test.io', 'acc-ap@test.io']);
    // German for the family with an account, with their free days and both store links.
    assert.match(sent[0].subject, /App ist da/);
    assert.match(sent[0].text, /Melde dich/);
    assert.match(sent[0].text, /30 Gratistage/);
    assert.match(sent[0].text, /apps\.apple\.com/);
    assert.match(sent[0].text, /play\.google\.com\/store\/apps\/details\?id=com\.pairmundo\.app/);
    assert.match(sent[1].text, /free for au pairs/);
    assert.doesNotMatch(sent[1].text, /free days/);

    // Pressing again carries on with whoever is left, one batch at a time, and never repeats anyone.
    failAt = null;
    await call2(admin, 'POST', '/admin/launch-email/send', { limit: 2 });
    await app2.launchEmailRun;
    await call2(admin, 'POST', '/admin/launch-email/send', { limit: 100 });
    await app2.launchEmailRun;
    const all = box.slice(start);
    assert.deepEqual(all.map((m) => m.to), ['acc-fam@test.io', 'acc-ap@test.io', 'both@test.io', 'wl-fam@test.io', 'wl-ap@test.io', 'someone@test.io']);
    const wlFam = all.find((m) => m.to === 'wl-fam@test.io');
    assert.match(wlFam.text, /Regístrate en la app con esta dirección de email \(wl-fam@test\.io\)/);
    assert.match(wlFam.text, /30 días gratis/);
    assert.match(wlFam.text, /\/api\/waitlist\/leave\?t=/);
    const someone = all.find((m) => m.to === 'someone@test.io');
    assert.doesNotMatch(someone.text, /free days|free for au pairs/);
    assert.match(someone.text, /To leave the list/);
    l = (await call2(admin, 'GET', '/admin/launch-email')).body;
    assert.deepEqual([l.sent, l.remaining], [6, 0]);
    // A family who already used their free days isn't told about them.
    db2.prepare("UPDATE early_bonus SET redeemed_at = datetime('now')").run();
    assert.equal((await call2(admin, 'POST', '/admin/launch-email/send', {})).status, 200);
    await app2.launchEmailRun;
    assert.equal(box.length, start + 6, 'nobody gets it twice');
  } finally {
    srv.close();
    for (const k of ['LAUNCH_EMAIL_GAP_MS', 'LAUNCH_DATE', 'APP_STORE_URL']) delete process.env[k];
  }
});

test('partner offers: admin adds affiliate links, they show on the right checklist step, clicks are counted', async () => {
  const fam = await register('partnerfam@test.io', 'family', 'SE', 'Familjen Partner');
  const ap = await register('partnerap@test.io', 'aupair', 'ES', 'Ana Partner');
  const req = await call(fam.token, 'POST', '/requests', { to_user: ap.id });
  await call(ap.token, 'POST', `/requests/${req.body.id}/respond`, { action: 'accept' });
  const pl = await call(fam.token, 'POST', '/placements', { other_user_id: ap.id, start_date: '2027-03-01', end_date: '2027-12-31', weekly_hours: 25, pocket_money: 5960 });
  assert.equal(pl.status, 201, JSON.stringify(pl.body));
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;

  // Only admins add offers, and the link must be https.
  const wise = { name: 'Wise', slot: 'arrival', url: 'https://wise.com/invite/test', blurb: 'Send pocket money home', audience: 'aupair' };
  assert.equal((await call(fam.token, 'POST', '/admin/partner-offers', wise)).status, 403);
  assert.equal((await call(admin, 'POST', '/admin/partner-offers', { ...wise, url: 'http://wise.com' })).status, 400);
  assert.equal((await call(admin, 'POST', '/admin/partner-offers', { ...wise, slot: 'nope' })).status, 400);
  const w = (await call(admin, 'POST', '/admin/partner-offers', wise)).body;
  await call(admin, 'POST', '/admin/partner-offers', { name: 'Insure DE', slot: 'insurance', url: 'https://example.com/de', countries: 'de' });
  await call(admin, 'POST', '/admin/partner-offers', { name: 'Insure SE', slot: 'insurance', url: 'https://example.com/se', countries: 'SE, xx1', audience: 'family' });

  const offersOn = (p, re) => p.tasks.find((t) => re.test(t.title)).offers.map((o) => o.name);
  let p = (await call(ap.token, 'GET', `/placements/${pl.body.id}`)).body;
  assert.deepEqual(offersOn(p, /^Arrival/), ['Wise']);
  assert.deepEqual(offersOn(p, /insurance/), []); // the Swedish insurance offer is for families, the German one for Germany
  assert.ok(!JSON.stringify(p.tasks).includes('wise.com')); // people go through our link, so the click is counted
  p = (await call(fam.token, 'GET', `/placements/${pl.body.id}`)).body;
  assert.deepEqual(offersOn(p, /insurance/), ['Insure SE']);
  assert.deepEqual(offersOn(p, /^Arrival/), []);

  // The tracked link redirects to the partner and counts the click, signed in or not.
  const res = await fetch(`${base}/partner-offers/${w.id}/go`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://wise.com/invite/test');
  let list = (await call(admin, 'GET', '/admin/partner-offers')).body.offers;
  assert.equal(list.find((o) => o.id === w.id).clicks, 1);
  assert.equal(list.find((o) => o.name === 'Insure SE').countries.join(), 'SE');

  // The public partners page lists names, never the links.
  const pub = (await call(null, 'GET', '/partners')).body.partners;
  assert.ok(pub.some((x) => x.name === 'Wise'));
  assert.ok(!JSON.stringify(pub).includes('https://'));

  // Switching an offer off hides it and stops its link.
  await call(admin, 'PUT', `/admin/partner-offers/${w.id}`, { active: false });
  p = (await call(ap.token, 'GET', `/placements/${pl.body.id}`)).body;
  assert.deepEqual(offersOn(p, /^Arrival/), []);
  assert.equal((await fetch(`${base}/partner-offers/${w.id}/go`, { redirect: 'manual' })).status, 404);
  assert.equal((await call(admin, 'DELETE', `/admin/partner-offers/${w.id}`)).status, 200);
  list = (await call(admin, 'GET', '/admin/partner-offers')).body.offers;
  assert.ok(!list.some((o) => o.id === w.id));
});

test('profile invites: waitlisted families without an account are invited once, reminded once after a few days, in their language', async () => {
  const db2 = openDb(':memory:');
  const box = [];
  const app2 = createApp(db2, { mailer: async (m) => { box.push(m); }, pusher: async (m) => m.map(() => ({ status: 'ok' })) });
  const srv = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const b2 = `http://127.0.0.1:${srv.address().port}/api`;
  const call2 = async (token, method, path, body, headers = {}) => {
    const res = await fetch(b2 + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  try {
    const { hashPassword } = await import('../server/auth.js');
    db2.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES ('boss@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
    const admin = (await call2(null, 'POST', '/auth/login', { email: 'boss@test.io', password: 'password123' })).body.token;
    await call2(null, 'POST', '/waitlist', { email: 'inv-sv@test.io', role: 'family' }, { 'Accept-Language': 'sv' });
    await call2(null, 'POST', '/waitlist', { email: 'inv-en@test.io', role: 'family' });
    await call2(null, 'POST', '/waitlist', { email: 'inv-ap@test.io', role: 'aupair' });
    await call2(null, 'POST', '/waitlist', { email: 'inv-joined@test.io', role: 'family' });
    await call2(null, 'POST', '/auth/register', { email: 'inv-joined@test.io', password: 'password123', role: 'family', name: 'Joined', country: 'SE' });

    let s = (await call2(admin, 'GET', '/admin/profile-invites')).body;
    assert.deepEqual([s.waitlist_families, s.waitlist_signed_up, s.waitlist_profiles_done, s.invite_ready, s.reminder_ready], [3, 1, 0, 2, 0]);
    assert.equal((await call2(null, 'GET', '/admin/profile-invites')).status, 401);

    // Only families with no account get it, in their language, with a sign-up link carrying their email and their saved days.
    box.length = 0;
    s = (await call2(admin, 'POST', '/admin/profile-invites/send', { kind: 'invite' })).body;
    assert.equal(s.sent, 2);
    assert.deepEqual(box.map((m) => m.to).sort(), ['inv-en@test.io', 'inv-sv@test.io']);
    const en = box.find((m) => m.to === 'inv-en@test.io');
    assert.match(en.subject, /Your family profile on PairMundo is open/);
    assert.match(en.text, /#\/register\?role=family&email=inv-en%40test\.io/);
    assert.match(en.text, /30 extra free days/);
    assert.match(en.text, /waitlist\/leave\?t=/);
    assert.match(box.find((m) => m.to === 'inv-sv@test.io').subject, /familjeprofil/);
    assert.equal((await call2(admin, 'POST', '/admin/profile-invites/send', { kind: 'invite' })).body.sent, 0, 'never twice');

    // The reminder waits until the invite is a few days old, and skips families who have signed up since.
    assert.equal((await call2(admin, 'POST', '/admin/profile-invites/send', { kind: 'reminder' })).body.sent, 0);
    db2.prepare("UPDATE profile_invites SET sent_at = datetime('now', '-6 days')").run();
    await call2(null, 'POST', '/auth/register', { email: 'inv-sv@test.io', password: 'password123', role: 'family', name: 'Svensson', country: 'SE' });
    box.length = 0;
    s = (await call2(admin, 'POST', '/admin/profile-invites/send', { kind: 'reminder' })).body;
    assert.equal(s.sent, 1);
    assert.deepEqual(box.map((m) => m.to), ['inv-en@test.io']);
    assert.match(box[0].subject, /Your family profile is waiting/);
    assert.equal(s.waitlist_signed_up, 2);
    assert.equal((await call2(admin, 'POST', '/admin/profile-invites/send', { kind: 'reminder' })).body.sent, 0, 'reminded once');

    const t = await call2(admin, 'POST', '/admin/profile-invites/test');
    assert.equal(t.body.count, 2);
  } finally {
    srv.close();
  }
});

test('profile nudges: accounts without a photo or bio are nudged 2 and 7 days after signing up, once each', async () => {
  const fam = await register('nudge-fam@test.io', 'family', 'SE', 'Nudge Family', { complete: false });
  const done = await register('nudge-done@test.io', 'family', 'SE', 'Done Family');
  const old = await register('nudge-old@test.io', 'aupair', 'CO', 'Old Ana', { complete: false });
  testDb.prepare("UPDATE users SET created_at = datetime('now', '-40 days') WHERE id = ?").run(old.id);
  const nudgesFor = (id) => testDb.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND kind = 'profile'").get(id).n;
  app.sendProfileNudges();
  assert.equal(nudgesFor(fam.id), 0, 'too early on the first day');
  testDb.prepare("UPDATE users SET created_at = datetime('now', '-3 days') WHERE id IN (?, ?)").run(fam.id, done.id);
  outbox.length = 0;
  app.sendProfileNudges();
  assert.equal(nudgesFor(fam.id), 1);
  assert.equal(nudgesFor(done.id), 0, 'a finished profile gets nothing');
  assert.equal(nudgesFor(old.id), 0, 'accounts older than 30 days get nothing');
  const mail = outbox.find((m) => m.to === 'nudge-fam@test.io');
  assert.match(mail.subject, /Au pairs can only like families with a photo/);
  assert.match(mail.text, /#\/profile/);
  app.sendProfileNudges();
  assert.equal(nudgesFor(fam.id), 1, 'once per step');
  testDb.prepare("UPDATE users SET created_at = datetime('now', '-8 days') WHERE id = ?").run(fam.id);
  app.sendProfileNudges();
  assert.equal(nudgesFor(fam.id), 2);
  app.sendProfileNudges();
  assert.equal(nudgesFor(fam.id), 2);
});

test('visa step: who needs a visa, how long it takes and when to start, per country and nationality', () => {
  const prog = (code) => PROGRAMS.find((p) => p.code === code);
  assert.equal(visaRoute(prog('DE'), 'PL').kind, 'none');
  assert.equal(visaRoute(prog('SE'), 'SE').kind, 'none');
  assert.equal(visaRoute(prog('NO'), 'ES').kind, 'none');
  assert.equal(visaRoute(prog('NO'), 'PH').kind, 'closed');
  assert.equal(visaRoute(prog('GB'), 'FR').kind, 'closed');
  assert.equal(visaRoute(prog('AU'), 'CO').kind, 'paused');
  assert.equal(visaRoute(prog('DE'), null).kind, 'unknown');
  const se = visaRoute(prog('SE'), 'PH', '2027-03-01');
  assert.equal(se.kind, 'visa');
  assert.equal(se.weeks, 13);
  assert.equal(se.apply_by, '2026-12-01');
  assert.ok(se.steps.some((s) => s.title.startsWith('Apply online to Migrationsverket')));
  const us = visaRoute(prog('US'), 'BR');
  assert.equal(us.kind, 'sponsor');
  assert.equal(us.apply_by, null);
  assert.equal(us.steps[0].owner, 'family');
  // Countries without their own paperwork use the generic 8 weeks.
  assert.equal(visaRoute(prog('ES'), 'CO').weeks, 11);
  assert.equal(visaRoute({ ...prog('ES'), code: 'XX' }, 'CO').weeks, 8);
});

test('visa help: partner agency referrals with consent, the family document pack and invitation letter', async () => {
  const fam = await register('visafam@test.io', 'family', 'US', 'The Millers');
  const ap = await register('visaap@test.io', 'aupair', 'BR', 'Bia Souza');
  await call(ap.token, 'PUT', '/me', { profile: { birth_date: '2003-04-04', nationality: 'BR' } });
  await call(fam.token, 'PUT', '/me', { city: 'Denver', profile: { start_date: '2027-03-01' } });
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  assert.equal((await call(admin, 'POST', '/admin/partner-offers', { name: 'Sponsor Co', slot: 'sponsor', url: 'https://sponsor.example', countries: 'US', lead_email: 'nope' })).status, 400);
  const offer = (await call(admin, 'POST', '/admin/partner-offers', { name: 'Sponsor Co', slot: 'sponsor', url: 'https://sponsor.example', countries: 'US', lead_email: 'leads@sponsor.example' })).body;
  assert.equal(offer.lead_email, 'leads@sponsor.example');

  // Before matching, the family sees what the visa takes and who can sponsor it.
  const view = (await call(fam.token, 'GET', `/users/${ap.id}`)).body;
  assert.equal(view.visa.kind, 'sponsor');
  assert.equal(view.visa.apply_by, '2026-12-16');
  assert.deepEqual(view.visa.agencies.map((a) => a.name), ['Sponsor Co']);
  assert.equal((await call(ap.token, 'GET', `/users/${fam.id}`)).body.visa.kind, 'sponsor');

  // Sharing details needs consent; the agency gets them with a referral code, once.
  assert.equal((await call(fam.token, 'POST', `/partner-offers/${offer.id}/refer`, {})).status, 400);
  const ref = await call(fam.token, 'POST', `/partner-offers/${offer.id}/refer`, { consent: true });
  assert.equal(ref.status, 201);
  assert.match(ref.body.code, /^PM-[0-9A-F]{8}$/);
  const lead = outbox.findLast((m) => m.to === 'leads@sponsor.example');
  assert.match(lead.text, /visafam@test\.io/);
  assert.ok(lead.text.includes(ref.body.code));
  const again = (await call(fam.token, 'POST', `/partner-offers/${offer.id}/refer`, { consent: true })).body;
  assert.equal(again.code, ref.body.code);
  assert.equal(again.already, true);

  const req = await call(fam.token, 'POST', '/requests', { to_user: ap.id });
  await call(ap.token, 'POST', `/requests/${req.body.id}/respond`, { action: 'accept' });
  const pl = await call(fam.token, 'POST', '/placements', { other_user_id: ap.id, start_date: '2027-03-01', end_date: '2028-02-28', weekly_hours: 40, pocket_money: 848 });
  assert.equal(pl.status, 201, JSON.stringify(pl.body));
  const pid = pl.body.id;
  let p = (await call(fam.token, 'GET', `/placements/${pid}`)).body;
  assert.deepEqual(p.tasks.find((t) => t.title.includes('designated au pair sponsor')).offers, [{ id: offer.id, name: 'Sponsor Co', blurb: null, referral: true }]);
  assert.equal(p.documents, null);
  assert.equal((await call(fam.token, 'GET', `/placements/${pid}/documents`)).status, 400);
  await call(ap.token, 'POST', `/placements/${pid}/confirm`);

  // The document pack: the US list, with the invitation letter written from the placement.
  let d = (await call(fam.token, 'GET', `/placements/${pid}/documents`)).body;
  assert.deepEqual(d.documents.map((x) => x.key), ['sponsor', 'home_check', 'agreement']);
  assert.equal(d.editable, true);
  assert.ok(d.letter.some(([text, vars]) => text.includes('pocket money') && vars.amount === 848 && vars.currency === 'USD'));
  assert.ok(d.letter.some(([text, vars]) => text.startsWith('Our address') && vars.address.startsWith('Denver')));
  d = (await call(fam.token, 'PUT', `/placements/${pid}/documents`, { address: '12 Elm St, Denver, CO 80202', doc: 'sponsor', done: true })).body;
  assert.ok(d.letter.some(([, vars]) => vars.address === '12 Elm St, Denver, CO 80202'));
  assert.equal(d.documents.find((x) => x.key === 'sponsor').done, true);
  assert.equal((await call(fam.token, 'PUT', `/placements/${pid}/documents`, { doc: 'nope', done: true })).status, 400);
  assert.equal((await call(ap.token, 'PUT', `/placements/${pid}/documents`, { doc: 'sponsor', done: false })).status, 403);
  assert.equal((await call(ap.token, 'GET', `/placements/${pid}/documents`)).body.editable, false);
  assert.deepEqual((await call(fam.token, 'GET', `/placements/${pid}`)).body.documents, { done: 1, total: 3 });

  // The referral counts as started when the placement starts; admins see and update referrals.
  await call(fam.token, 'POST', `/placements/${pid}/status`, { status: 'active' });
  let refs = (await call(admin, 'GET', '/admin/referrals')).body.referrals;
  const mine = refs.find((r) => r.code === ref.body.code);
  assert.equal(mine.status, 'started');
  assert.equal(mine.host_country, 'US');
  assert.ok(mine.started_at);
  assert.equal((await call(fam.token, 'GET', '/admin/referrals')).status, 403);
  assert.equal((await call(admin, 'PUT', `/admin/referrals/${mine.id}`, { status: 'maybe' })).status, 400);
  assert.equal((await call(admin, 'PUT', `/admin/referrals/${mine.id}`, { status: 'not_going' })).body.started_at, null);
});

test('agency spaces: closed network, hidden contact details, introduction log and covered Family Pass', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  let r = await call(admin, 'POST', '/admin/ambassadors', { code: 'DREAMDEMO', name: 'Demo Nannies', country: 'au', kind: 'agency', account_email: 'boss@demonannies.test',
    closed_network: true, mask_contacts: true, covers_pass: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.closed_network, r.body.mask_contacts, r.body.covers_pass], [1, 1, 1]);
  const join = async (email, role, ref_code) => {
    const res = await call(null, 'POST', '/auth/register', { email, password: 'password123', role, name: `${role} ${email}`, country: 'AU', ref_code });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    await call(res.body.token, 'POST', '/auth/verify-email', { code: lastCode(email) });
    await completeProfile(res.body.token, res.body.user.id, email);
    return { token: res.body.token, id: res.body.user.id };
  };
  const fam = await join('spacefam@test.io', 'family', 'DREAMDEMO');
  const ap = await join('spaceap@test.io', 'aupair', 'DREAMDEMO');
  const outsiderFam = await register('outfam@test.io', 'family', 'AU');
  const outsiderAp = await register('outap@test.io', 'aupair', 'IE');

  // Closed network: the agency's family only sees its au pairs, and outsiders can't see or like them.
  const seen = (await call(fam.token, 'GET', '/search?limit=100')).body.results.map((x) => x.user.id);
  assert.ok(seen.includes(ap.id) && !seen.includes(outsiderAp.id), JSON.stringify(seen));
  assert.ok(!(await call(outsiderFam.token, 'GET', '/search?limit=100')).body.results.some((x) => x.user.id === ap.id));
  assert.equal((await call(outsiderFam.token, 'GET', `/users/${ap.id}`)).status, 404);
  assert.equal((await call(outsiderFam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' })).status, 404);
  assert.equal((await call(fam.token, 'POST', '/requests', { to_user: outsiderAp.id })).status, 404);

  // The agency covers the Family Pass: its family can message without one, even when the pass is on.
  process.env.FAMILY_PASS = 'on';
  try {
    assert.equal((await call(fam.token, 'GET', '/family-pass')).body.required, true);
    assert.equal((await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like', message: 'Hi! Call me on +61 412 345 678' })).status, 200);
    r = await call(ap.token, 'POST', '/swipe', { target_id: fam.id, direction: 'like' });
    assert.equal(r.body.matched, true);
    const cid = r.body.conversation_id;
    r = await call(fam.token, 'POST', `/conversations/${cid}/messages`, { body: 'Email me at sarah@example.com or find me @sarah.h, we start 2027-01-15' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(!r.body.body.includes('sarah@example.com') && !r.body.body.includes('@sarah.h'), r.body.body);
    assert.ok(r.body.body.includes('2027-01-15'), 'dates are not hidden');
    const msgs = (await call(ap.token, 'GET', `/conversations/${cid}/messages`)).body.messages;
    assert.ok(msgs.every((m) => !/412 345 678/.test(m.body)), 'the like message was hidden too');
    assert.equal((await call(ap.token, 'POST', `/conversations/${cid}/messages`, { body: 'See you Thursday!' })).body.body, 'See you Thursday!');
  } finally { delete process.env.FAMILY_PASS; }

  // The agency account sees the introduction and the flags.
  const boss = await register('boss@demonannies.test', 'agency', 'AU', 'Boss', { complete: false });
  testDb.prepare("UPDATE ambassadors SET user_id = ? WHERE code = 'DREAMDEMO'").run(boss.id);
  const amb = (await call(boss.token, 'GET', '/me/ambassador')).body;
  assert.equal(amb.introductions.length, 1);
  assert.equal(amb.introductions[0].how, 'match');
  assert.equal(amb.flags.length, 2);
  assert.deepEqual([amb.space.closed_network, amb.space.families], [true, 1]);

  // An open agency space changes nothing for outsiders.
  await call(admin, 'POST', `/admin/ambassadors/${amb.id ?? testDb.prepare("SELECT id FROM ambassadors WHERE code = 'DREAMDEMO'").get().id}`, { closed_network: false });
  assert.ok((await call(outsiderFam.token, 'GET', '/search?limit=100')).body.results.some((x) => x.user.id === ap.id));
});

test('agency approval: families wait for their agency, which tracks each one through its stages', async () => {
  const { hashPassword } = await import('../server/auth.js');
  testDb.prepare("INSERT OR IGNORE INTO users (email, password_hash, role, name, email_verified) VALUES ('admin@test.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123'));
  const admin = (await call(null, 'POST', '/auth/login', { email: 'admin@test.io', password: 'password123' })).body.token;
  let r = await call(admin, 'POST', '/admin/ambassadors', { code: 'GATEDEMO', name: 'Gate Nannies', country: 'au', kind: 'agency', closed_network: true, approve_families: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.approve_families, 1);
  const join = async (email, role) => {
    const res = await call(null, 'POST', '/auth/register', { email, password: 'password123', role, name: `${role} ${email}`, country: 'AU', ref_code: 'GATEDEMO' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    await call(res.body.token, 'POST', '/auth/verify-email', { code: lastCode(email) });
    await completeProfile(res.body.token, res.body.user.id, email);
    return { token: res.body.token, id: res.body.user.id };
  };
  const fam = await join('approvefam@test.io', 'family');
  const ap = await join('approveap@test.io', 'aupair');

  // Until the agency approves them, the family sees nobody and can't like or write to anyone.
  r = await call(fam.token, 'GET', '/discover');
  assert.deepEqual([r.body.results.length, r.body.awaiting_agency], [0, 'Gate Nannies']);
  assert.equal((await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' })).body.code, 'agency_approval');
  assert.equal((await call(fam.token, 'POST', '/requests', { to_user: ap.id })).status, 403);
  // The agency's au pairs aren't held back.
  assert.equal((await call(ap.token, 'GET', '/search?limit=100')).body.awaiting_agency, undefined);

  // Only the agency's own account sees and moves its families.
  const boss = await register('boss@gatenannies.test', 'agency', 'AU', 'Boss', { complete: false });
  assert.equal((await call(boss.token, 'GET', '/agency/families')).status, 403);
  testDb.prepare("UPDATE ambassadors SET user_id = ? WHERE code = 'GATEDEMO'").run(boss.id);
  r = await call(boss.token, 'GET', '/agency/families');
  assert.equal(r.body.approve_families, true);
  assert.deepEqual(r.body.families.map((f) => [f.id, f.stage, f.fee_paid]), [[fam.id, 'enquiry', false]]);
  assert.equal((await call(boss.token, 'POST', `/agency/families/${ap.id}`, { stage: 'approved' })).status, 404);
  assert.equal((await call(boss.token, 'POST', `/agency/families/${fam.id}`, { stage: 'nope' })).status, 400);
  r = await call(boss.token, 'POST', `/agency/families/${fam.id}`, { stage: 'approved', fee_paid: true, note: 'Paid the registration fee' });
  assert.deepEqual([r.body.stage, r.body.fee_paid, r.body.note], ['approved', true, 'Paid the registration fee']);
  r = await call(boss.token, 'POST', `/agency/families/${fam.id}`, { stage: 'matching' });
  assert.deepEqual([r.body.stage, r.body.fee_paid, r.body.note], ['matching', true, 'Paid the registration fee'], 'other fields are kept');
  assert.ok((await call(fam.token, 'GET', '/notifications')).body.notifications?.some((n) => /approved your account/.test(n.body ?? n.text ?? JSON.stringify(n))));

  // Approved, the family meets the agency's au pairs.
  assert.ok((await call(fam.token, 'GET', '/discover')).body.results.some((x) => x.user.id === ap.id));
  assert.equal((await call(fam.token, 'POST', '/swipe', { target_id: ap.id, direction: 'like' })).status, 200);
});
