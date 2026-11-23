import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { cityKey, distanceBand, isNear, toGrid } from '../server/nearby.js';

let server; let base; let db;
const pushed = [];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.NEARBY_MIN_PEOPLE = '3';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-near-');
  db = openDb(':memory:');
  const app = createApp(db, { mailer: async () => {}, pusher: async (msgs) => { pushed.push(...msgs); return msgs.map(() => ({ status: 'ok' })); },
    moderator: async () => ({ verdict: 'allow', category: 'none', note: '' }) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); delete process.env.NEARBY_MIN_PEOPLE; });

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: 'password123' })).body.token;
/** A member with a photo and a bio, ready to be seen. */
const member = async (email, role, name, { country = 'SE', city = 'Stockholm', extra = {} } = {}) => {
  const cols = { email, password_hash: hashPassword('password123'), role, name, country, city, email_verified: 1,
    photos: JSON.stringify(['/uploads/x.jpg']), ...extra };
  const id = Number(db.prepare(`INSERT INTO users (${Object.keys(cols).join(',')}) VALUES (${Object.keys(cols).map(() => '?').join(',')})`).run(...Object.values(cols)).lastInsertRowid);
  db.prepare(`INSERT INTO ${role === 'aupair' ? 'aupair_profiles' : 'family_profiles'} (user_id, bio) VALUES (?, ?)`).run(id, `Hi, I am ${name}.`);
  return { id, token: await login(email) };
};
const inAnHour = (h = 26) => new Date(Date.now() + h * 3600e3).toISOString();

test('nearby helpers: city names match loosely, points snap to a grid, distance shows as a band', () => {
  assert.equal(cityKey('  Malmö '), 'malmo');
  assert.equal(cityKey('São Paulo'), cityKey('sao paulo'));
  assert.equal(toGrid(59.33258, 90), 59.34);
  assert.equal(toGrid(18.0649, 180), 18.06);
  assert.equal(toGrid('nope', 90), null);
  assert.equal(toGrid(200, 180), null);
  const a = { country: 'SE', city_key: 'stockholm', lat: 59.34, lng: 18.06 };
  assert.equal(distanceBand(a, { lat: 59.36, lng: 18.06 }), 3);
  assert.equal(distanceBand(a, { lat: null, lng: null }), null);
  assert.ok(isNear(a, { country: 'SE', city_key: 'solna', lat: 59.36, lng: 18.0 }));
  assert.ok(!isNear(a, { country: 'SE', city_key: 'solna', lat: null, lng: null }));
  assert.ok(!isNear(a, { country: 'SE', city_key: 'goteborg', lat: 57.7, lng: 11.96 }));
});

test('people nearby: opt-in, same side only, hidden until the city has enough people, approximate only', async () => {
  const ana = await member('ana@near.io', 'aupair', 'Ana Lima');
  const bea = await member('bea@near.io', 'aupair', 'Bea Costa');
  const fam = await member('fam@near.io', 'family', 'Fam Berg');

  // Off by default.
  assert.equal((await call(ana.token, 'GET', '/nearby')).body.settings, null);

  const on = await call(ana.token, 'PUT', '/me/nearby', { city: 'Stockholm', country: 'SE', lat: 59.332581, lng: 18.064910 });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  assert.deepEqual(on.body.settings, { city: 'Stockholm', country: 'SE', approximate: true, visible: true, families_can_find: false });
  // Only the rounded point is stored.
  const row = db.prepare('SELECT lat, lng FROM nearby_settings WHERE user_id = ?').get(ana.id);
  assert.deepEqual([row.lat, row.lng], [59.34, 18.06]);

  await call(bea.token, 'PUT', '/me/nearby', { city: 'stockholm ', country: 'SE', lat: 59.35, lng: 18.07 });
  // Changing who sees her keeps her rounded point; a new city drops it.
  await call(ana.token, 'PUT', '/me/nearby', { city: 'Stockholm', country: 'SE', visible: true });
  assert.equal(db.prepare('SELECT lat FROM nearby_settings WHERE user_id = ?').get(ana.id).lat, 59.34);
  await call(fam.token, 'PUT', '/me/nearby', { city: 'Stockholm', country: 'SE' });

  // Two au pairs is under the minimum of three: the city stays locked, and nobody is listed.
  let n = (await call(ana.token, 'GET', '/nearby')).body;
  assert.equal(n.city.unlocked, false);
  assert.equal(n.city.people, 2);
  assert.equal(n.city.needed, 1);
  assert.deepEqual(n.people, []);
  assert.equal((await call(ana.token, 'POST', `/nearby/people/${bea.id}/hello`)).status, 404);

  const cleo = await member('cleo@near.io', 'aupair', 'Cleo Diaz');
  await call(cleo.token, 'PUT', '/me/nearby', { city: 'Stockholm', country: 'SE' });
  n = (await call(ana.token, 'GET', '/nearby')).body;
  assert.equal(n.city.unlocked, true);
  assert.deepEqual(n.people.map((p) => p.user.name).sort(), ['Bea C.', 'Cleo D.']);
  // Families never show to au pairs here, and no exact coordinates go out.
  assert.ok(!JSON.stringify(n.people).includes('Fam'));
  assert.ok(!JSON.stringify(n).includes('59.3'));
  assert.equal(n.people.find((p) => p.user.id === bea.id).distance, 3);
  // The family's own city has only one family: locked.
  assert.equal((await call(fam.token, 'GET', '/nearby')).body.city.unlocked, false);

  // Hidden people see nobody, and nobody sees them.
  await call(cleo.token, 'PUT', '/me/nearby', { city: 'Stockholm', country: 'SE', visible: false });
  assert.deepEqual((await call(cleo.token, 'GET', '/nearby')).body.people, []);
  await call(cleo.token, 'PUT', '/me/nearby', { city: 'Stockholm', country: 'SE', visible: true });

  // Say hi, and saying hi back opens a chat, free of the Family Pass rules.
  const hi = await call(ana.token, 'POST', `/nearby/people/${bea.id}/hello`, { message: 'Hi! Fika this week?' });
  assert.equal(hi.status, 201, JSON.stringify(hi.body));
  assert.equal((await call(ana.token, 'GET', '/nearby')).body.people.find((p) => p.user.id === bea.id).hello, 'sent');
  const inbox = (await call(bea.token, 'GET', '/nearby')).body.hellos;
  assert.equal(inbox.length, 1);
  const ok = await call(bea.token, 'POST', `/nearby/hellos/${inbox[0].id}`, { accept: true });
  assert.equal(ok.body.status, 'connected');
  const msgs = await call(bea.token, 'GET', `/conversations/${ok.body.conversation_id}/messages`);
  assert.equal(msgs.body.messages[0].body, 'Hi! Fika this week?');
  assert.equal((await call(bea.token, 'POST', `/conversations/${ok.body.conversation_id}/messages`, { body: 'Yes!' })).status, 201);

  // Blocking hides them from each other.
  await call(ana.token, 'POST', `/users/${cleo.id}/block`);
  assert.ok(!(await call(cleo.token, 'GET', '/nearby')).body.people.some((p) => p.user.id === ana.id));
  assert.equal((await call(cleo.token, 'POST', `/nearby/people/${ana.id}/hello`)).status, 404);

  // Turning it off forgets the city.
  await call(bea.token, 'DELETE', '/me/nearby');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM nearby_settings WHERE user_id = ?').get(bea.id).n, 0);
});

test('find an au pair near you: only au pairs who let families find them, in or around the family city', async () => {
  const fam = await member('hostfam@near.io', 'family', 'Host Family', { city: 'Uppsala' });
  const near = await member('near@near.io', 'aupair', 'Near Pair', { city: 'Uppsala' });
  const shy = await member('shy@near.io', 'aupair', 'Shy Pair', { city: 'Uppsala' });
  const far = await member('far@near.io', 'aupair', 'Far Pair', { city: 'Lund' });
  await call(near.token, 'PUT', '/me/nearby', { city: 'Uppsala', country: 'SE', families_can_find: true });
  await call(shy.token, 'PUT', '/me/nearby', { city: 'Uppsala', country: 'SE' });
  await call(far.token, 'PUT', '/me/nearby', { city: 'Lund', country: 'SE', families_can_find: true });
  // Families can't flag themselves as findable.
  assert.equal((await call(fam.token, 'PUT', '/me/nearby', { city: 'Uppsala', country: 'SE', families_can_find: true })).body.settings.families_can_find, false);
  await call(fam.token, 'DELETE', '/me/nearby');

  // Without Nearby on, the family's profile city is used.
  const r = await call(fam.token, 'GET', '/discover?near=1');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.results.map((x) => x.user.id), [near.id]);
  assert.equal(r.body.results[0].near.city, 'Uppsala');
  // Without the filter, everyone shows as before.
  const all = (await call(fam.token, 'GET', '/discover')).body.results.map((x) => x.user.id);
  assert.ok([near.id, shy.id, far.id].every((id) => all.includes(id)));
  const nocity = await member('nocity@near.io', 'family', 'No City', { city: null });
  assert.equal((await call(nocity.token, 'GET', '/discover?near=1')).body.near_needs_city, true);
});

test('meetups: verified hosts, public places only, exact spot for people going, agency and external listings, reports', async () => {
  const host = await member('host@near.io', 'aupair', 'Hana Host', { city: 'Malmö', extra: { id_verified: 1 } });
  const guest = await member('guest@near.io', 'aupair', 'Gus Guest', { city: 'Malmö' });
  const famm = await member('famm@near.io', 'family', 'Fam Malmo', { city: 'Malmö' });
  for (const m of [host, guest, famm]) await call(m.token, 'PUT', '/me/nearby', { city: 'Malmö', country: 'SE' });
  const meet = { title: 'Fika by the canal', kind: 'coffee', place: 'Espresso House, Gustav Adolfs torg', area: 'City centre', starts_at: inAnHour(), public_place: true };

  // Hosting needs an ID check; joining doesn't.
  assert.equal((await call(guest.token, 'POST', '/meetups', meet)).body.code, 'id_required');
  // Public places only.
  assert.equal((await call(host.token, 'POST', '/meetups', { ...meet, public_place: false })).status, 400);
  assert.equal((await call(host.token, 'POST', '/meetups', { ...meet, place: 'My flat, ring the bell' })).body.code, 'public_place');
  assert.equal((await call(host.token, 'POST', '/meetups', { ...meet, starts_at: new Date(Date.now() + 60000).toISOString() })).status, 400);
  const made = await call(host.token, 'POST', '/meetups', meet);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.meetup.id;
  assert.equal(made.body.meetup.city, 'Malmö');
  assert.equal(made.body.meetup.max_people, 8);

  // Listed for au pairs in Malmö even though the city has too few people for the people list.
  let list = (await call(guest.token, 'GET', '/nearby')).body;
  assert.equal(list.city.unlocked, false);
  const seen = list.meetups.find((m) => m.id === id);
  assert.equal(seen.area, 'City centre');
  assert.equal(seen.place, null);
  // Au pair meetups are not shown to families.
  assert.ok(!(await call(famm.token, 'GET', '/nearby')).body.meetups.some((m) => m.id === id));
  assert.equal((await call(famm.token, 'GET', `/meetups/${id}`)).status, 404);

  const joined = await call(guest.token, 'POST', `/meetups/${id}/join`);
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.equal(joined.body.meetup.place, 'Espresso House, Gustav Adolfs torg');
  assert.equal(joined.body.meetup.going, 1);
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE '%is coming to Fika%'").get(host.id));
  assert.equal((await call(guest.token, 'POST', `/meetups/${id}/messages`, { body: 'Red jacket!' })).status, 201);
  assert.equal((await call(host.token, 'GET', `/meetups/${id}/messages`)).body.messages[0].body, 'Red jacket!');
  // Not going: no chat.
  const other = await member('other@near.io', 'aupair', 'Oli Other', { city: 'Malmö' });
  await call(other.token, 'PUT', '/me/nearby', { city: 'Malmo', country: 'SE' });
  assert.equal((await call(other.token, 'GET', `/meetups/${id}/messages`)).status, 403);

  // Three people reporting hides it until the admin looks.
  const r1 = await member('r1@near.io', 'aupair', 'Rae One', { city: 'Malmö' });
  const r2 = await member('r2@near.io', 'aupair', 'Rae Two', { city: 'Malmö' });
  for (const m of [r1, r2]) await call(m.token, 'PUT', '/me/nearby', { city: 'Malmö', country: 'SE' });
  for (const m of [other, r1, r2]) assert.equal((await call(m.token, 'POST', `/meetups/${id}/report`, { reason: 'Felt wrong' })).status, 201);
  assert.equal(db.prepare('SELECT status FROM meetups WHERE id = ?').get(id).status, 'hidden');
  assert.ok(!(await call(other.token, 'GET', '/nearby')).body.meetups.some((m) => m.id === id));
  const adminId = Number(db.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES ('boss@near.io', ?, 'admin', 'Admin', 1)").run(hashPassword('password123')).lastInsertRowid);
  const admin = await login('boss@near.io');
  assert.ok(adminId);
  const reports = (await call(admin, 'GET', '/admin/reports')).body.reports.filter((x) => x.meetup_id === id);
  assert.equal(reports.length, 3);
  assert.equal(reports[0].meetup_title, 'Fika by the canal');
  assert.equal((await call(admin, 'POST', `/admin/meetups/${id}`, { status: 'open' })).status, 200);
  assert.ok((await call(other.token, 'GET', '/nearby')).body.meetups.some((m) => m.id === id));

  // Cancelling tells the people going.
  await call(host.token, 'POST', `/meetups/${id}/cancel`);
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE '%was cancelled%'").get(guest.id));

  // An external listing links out and shows its place to everyone.
  const ext = await call(admin, 'POST', '/meetups', { title: 'Language café', kind: 'language', place: 'Malmö City Library', city: 'malmo', country: 'SE',
    starts_at: inAnHour(48), external_url: 'https://example.org/language-cafe', organizer: 'Malmö City Library', audience: 'both' });
  assert.equal(ext.status, 201, JSON.stringify(ext.body));
  const extSeen = (await call(famm.token, 'GET', '/nearby')).body.meetups.find((m) => m.id === ext.body.meetup.id);
  assert.equal(extSeen.external, true);
  assert.equal(extSeen.place, 'Malmö City Library');
  assert.equal((await call(famm.token, 'POST', `/meetups/${ext.body.meetup.id}/join`)).status, 400);

  // An agency's meetup is for its own au pairs, who hear about it.
  const boss = Number(db.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES ('agency@near.io', ?, 'agency', 'Sunny Agency', 1)").run(hashPassword('password123')).lastInsertRowid);
  db.prepare("INSERT INTO ambassadors (code, name, kind, country, user_id) VALUES ('SUNNY-NEAR', 'Sunny Au Pairs', 'agency', 'SE', ?)").run(boss);
  db.prepare("UPDATE users SET ref_code = 'SUNNY-NEAR' WHERE id = ?").run(guest.id);
  const agency = await login('agency@near.io');
  const off = await call(agency, 'POST', '/meetups', { title: 'Welcome picnic', kind: 'picnic', place: 'Pildammsparken, by the big pond', city: 'Malmö', country: 'SE',
    starts_at: inAnHour(72), public_place: true, audience: 'aupair' });
  assert.equal(off.status, 201, JSON.stringify(off.body));
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND text LIKE 'Sunny Au Pairs invited you%'").get(guest.id));
  const g = (await call(guest.token, 'GET', '/nearby')).body.meetups.find((m) => m.id === off.body.meetup.id);
  assert.equal(g.official, true);
  assert.equal(g.agency, 'Sunny Au Pairs');
  assert.ok(!(await call(other.token, 'GET', '/nearby')).body.meetups.some((m) => m.id === off.body.meetup.id));
  assert.equal((await call(agency, 'GET', '/agency/meetups')).body.meetups.length, 1);
});

test('map: meetups as rounded pins unless going, people only as area counts of 3 or more', async () => {
  const people = [];
  for (const [i, lat] of [59.86, 59.86, 59.85, 59.62, 59.86].entries()) {
    const m = await member(`map${i}@near.io`, 'aupair', `Map Person${i}`, { city: 'Västerås', extra: { id_verified: 1 } });
    await call(m.token, 'PUT', '/me/nearby', { city: 'Västerås', country: 'SE', lat, lng: 16.55 });
    people.push(m);
  }
  const made = await call(people[0].token, 'POST', '/meetups', { title: 'Lake walk', kind: 'walk', place: 'Mälarparken, by the pier', starts_at: inAnHour(), public_place: true, lat: 59.60123, lng: 16.53456 });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const map = (await call(people[1].token, 'GET', '/nearby/map')).body;
  assert.equal(map.city.unlocked, true);
  // Four people near 59.86 make a bubble; the one at 59.62 is alone and stays off the map.
  assert.deepEqual(map.areas.map((a) => a.count), [4]);
  assert.ok(!JSON.stringify(map).includes('59.62'));
  const pin = map.meetups.find((m) => m.id === made.body.meetup.id).point;
  assert.deepEqual(pin, { lat: 59.6, lng: 16.54, exact: false });
  await call(people[1].token, 'POST', `/meetups/${made.body.meetup.id}/join`);
  const going = (await call(people[1].token, 'GET', '/nearby/map')).body.meetups.find((m) => m.id === made.body.meetup.id).point;
  assert.deepEqual(going, { lat: 59.6012, lng: 16.5346, exact: true });
  // Off Nearby: no map.
  const off = await member('mapoff@near.io', 'aupair', 'Map Off');
  assert.equal((await call(off.token, 'GET', '/nearby/map')).body.settings, null);
});
