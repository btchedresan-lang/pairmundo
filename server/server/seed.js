// Fills the database with demo accounts. Every demo password is "password123".
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aupairPortrait, familyPortrait } from './portraits.js';
import { openDb, json } from './db.js';
import { seedPrograms } from './app.js';
import { hashPassword } from './auth.js';
import { PLACEMENT_TASKS } from './programs.js';

const file = process.env.DB_FILE || 'data/aupair.db';
if (file !== ':memory:') for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
const uploads = process.env.UPLOAD_DIR || 'data/uploads';
rmSync(uploads, { recursive: true, force: true });
mkdirSync(uploads, { recursive: true });
const db = openDb(file);
const SKIN = { CO: '#d09a6e', PL: '#f6d3b3', ZA: '#5a3820', VN: '#e8b48f', IT: '#e8b48f', GH: '#5a3820', SE: '#f6d3b3', BR: '#a8714a' };
const photosFor = (slug, make) => [0, 1, 2].map((v) => {
  const name = `seed-${slug}-${v}.svg`;
  writeFileSync(join(uploads, name), make(v));
  return `/uploads/${name}`;
});
seedPrograms(db);
const pw = hashPassword('password123');

const addUser = (email, role, name, country, city, verified = {}, photos = []) => Number(db.prepare(
  `INSERT INTO users (email, password_hash, role, name, country, city, photo_url, photos, id_verified, references_checked, background_checked, email_verified)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`).run(email, pw, role, name, country, city, photos[0] || null, JSON.stringify(photos),
  verified.id ? 1 : 0, verified.refs ? 1 : 0, verified.bg ? 1 : 0).lastInsertRowid);

addUser('admin@aupair.test', 'admin', 'Program Admin', null, null);

const aupairs = [
  ['maria@aupair.test', 'Maria Gonzalez', 'CO', 'Bogotá', '2003-04-12', 'CO', [{ code: 'es', level: 'native' }, { code: 'en', level: 'C1' }], ['US', 'DE'], 4, ['toddler', 'school'], ['first_aid', 'cooking', 'swimming'], 1, '2026-12-01', 12, 'Early-childhood education student who has nannied for two families. I love crafts, outdoor play and teaching Spanish through songs.', { id: 1, refs: 1, bg: 1 }],
  ['anna@aupair.test', 'Anna Kowalska', 'PL', 'Kraków', '2001-09-03', 'PL', [{ code: 'pl', level: 'native' }, { code: 'en', level: 'B2' }, { code: 'de', level: 'B1' }], ['DE', 'NL'], 3, ['infant', 'toddler'], ['first_aid', 'cooking'], 1, '2027-01-10', 12, 'Nursing graduate with infant experience. Calm, organised and happy to help with light housework.', { id: 1, refs: 1 }],
  ['thandi@aupair.test', 'Thandi Mokoena', 'ZA', 'Cape Town', '2004-02-20', 'ZA', [{ code: 'en', level: 'native' }, { code: 'af', level: 'C1' }], ['US'], 5, ['infant', 'toddler', 'school'], ['first_aid', 'swimming', 'tutoring'], 1, '2026-11-15', 12, 'Five years at a daycare centre, lifeguard certified, and an avid hiker.', { id: 1, refs: 1, bg: 1 }],
  ['linh@aupair.test', 'Linh Nguyen', 'VN', 'Hanoi', '2002-06-30', 'VN', [{ code: 'vi', level: 'native' }, { code: 'en', level: 'C1' }, { code: 'fr', level: 'B1' }], ['FR', 'US'], 2, ['school', 'teen'], ['tutoring', 'music', 'cooking'], 0, '2027-02-01', 10, 'Maths tutor and piano player. I want to improve my French and share Vietnamese culture.', { id: 1 }],
  ['sofia@aupair.test', 'Sofia Rossi', 'IT', 'Bologna', '2000-11-11', 'IT', [{ code: 'it', level: 'native' }, { code: 'en', level: 'B2' }, { code: 'es', level: 'B2' }], ['ES', 'FR'], 2, ['toddler', 'school'], ['cooking', 'art'], 1, '2026-10-20', 9, 'Art student who loves cooking with kids. Patient, cheerful and flexible.', {}],
  ['kofi@aupair.test', 'Kofi Mensah', 'GH', 'Accra', '2003-08-08', 'GH', [{ code: 'en', level: 'native' }, { code: 'fr', level: 'B1' }], ['US', 'CA'], 3, ['school', 'teen'], ['sports', 'tutoring', 'first_aid'], 1, '2026-12-15', 12, 'Youth football coach and big brother to four. Great with energetic school-age kids.', { id: 1, refs: 1 }],
  ['emma@aupair.test', 'Emma Johansson', 'SE', 'Gothenburg', '2005-01-25', 'SE', [{ code: 'sv', level: 'native' }, { code: 'en', level: 'C2' }, { code: 'de', level: 'A2' }], ['DE', 'AU', 'US'], 2, ['toddler', 'school'], ['swimming', 'music'], 1, '2027-01-05', 12, 'Gap-year before university. Swimming instructor, guitar player, loves the outdoors.', { id: 1 }],
  ['ana@aupair.test', 'Ana Souza', 'BR', 'Curitiba', '1999-05-14', 'BR', [{ code: 'pt', level: 'native' }, { code: 'en', level: 'C1' }, { code: 'es', level: 'B2' }], ['NL', 'DK', 'NO'], 6, ['infant', 'toddler', 'school'], ['first_aid', 'cooking', 'tutoring'], 1, '2026-11-01', 12, 'Pedagogy graduate, six years in childcare. Looking for a Scandinavian or Dutch family.', { id: 1, refs: 1, bg: 1 }],
];
// Certificates a few demo au pairs have added.
const CERTS = {
  maria: [{ kind: 'cpr', detail: 'Cruz Roja Colombiana, 2026' }, { kind: 'language', detail: 'IELTS 7.0' }],
  anna: [{ kind: 'first_aid', detail: 'Polish Red Cross, 2025' }, { kind: 'cpr', detail: 'Infant CPR, 2025' }, { kind: 'language', detail: 'Goethe-Zertifikat B1' }],
  ana: [{ kind: 'childcare', detail: 'Pedagogy degree' }, { kind: 'cpr', detail: '2026' }, { kind: 'police', detail: 'Issued August 2026' }],
};
const apIds = aupairs.map(([email, name, country, city, birth, nat, langs, prefs, years, groups, skills, driver, avail, dur, bio, ver]) => {
  const slug = email.split('@')[0];
  const id = addUser(email, 'aupair', name, country, city, ver, photosFor(slug, (v) => aupairPortrait(name, v, { skin: SKIN[country] })));
  db.prepare(`INSERT INTO aupair_profiles (user_id, birth_date, nationality, languages, preferred_countries, childcare_years, age_groups, skills,
      drivers_license, available_from, duration_months, education, bio) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, birth, nat, json.str(langs), json.str(prefs), years, json.str(groups), json.str(skills), driver, avail, dur, 'University', bio);
  if (CERTS[slug]) db.prepare('UPDATE aupair_profiles SET certificates = ? WHERE user_id = ?').run(json.str(CERTS[slug]), id);
  return id;
});

// Demo references: Maria and Anna each have confirmed ones, and Anna is waiting on one more.
const addRef = (userId, name, email, relation, answers) => db.prepare(`INSERT INTO reference_checks (user_id, name, email, relation, token, status, answers, responded_at)
  VALUES (?,?,?,?,?,?,?,?)`).run(userId, name, email, relation, `demo-${email}`, answers ? 'confirmed' : 'sent', answers ? json.str(answers) : null, answers ? '2026-09-20 10:00:00' : null);
addRef(apIds[0], 'Lucía Pérez', 'lucia@example.com', 'Family I nannied for in Bogotá', { months: 24, rating: 5, recommend: true, age_groups: ['toddler', 'school'], comment: 'Maria was patient, creative and always on time. Our girls still ask about her.' });
addRef(apIds[1], 'Katarzyna Wiśniewska', 'kasia@example.com', 'Mother of the twins I looked after', { months: 14, rating: 5, recommend: true, age_groups: ['infant'], comment: 'Calm with babies and very organised. We trusted her completely.' });
addRef(apIds[1], 'Tomasz Zieliński', 'tomasz@example.com', 'Summer babysitting, 2025', { months: 3, rating: 4, recommend: true, age_groups: ['school'], comment: null });
addRef(apIds[1], 'Przedszkole Słoneczko', 'kindergarten@example.com', 'Kindergarten internship', null);
db.prepare('UPDATE users SET references_checked = 1 WHERE id IN (?, ?)').run(apIds[0], apIds[1]);

const families = [
  ['millers@aupair.test', 'The Miller Family', 'US', 'Denver, CO', [{ age: 3 }, { age: 7 }], ['en'], ['en'], '2026-12-01', 12, 45, 848, 1, 1, 'Two kids, a golden retriever and a love for skiing. Looking for an outdoorsy au pair to join us.', { id: 1, refs: 1 }],
  ['schmidts@aupair.test', 'Familie Schmidt', 'DE', 'Hamburg', [{ age: 1 }, { age: 4 }], ['de', 'en'], ['de'], '2027-01-15', 12, 30, 280, 0, 0, 'Doctors in Hamburg with a toddler and a baby. We value calm, reliability and some German.', { id: 1 }],
  ['dupont@aupair.test', 'Famille Dupont', 'FR', 'Lyon', [{ age: 9 }, { age: 12 }], ['fr'], ['en'], '2027-02-01', 10, 25, 350, 0, 0, 'We want our kids to practise English. School pick-ups, homework help and weekend museum trips.', { id: 1, refs: 1 }],
  ['devries@aupair.test', 'Familie de Vries', 'NL', 'Utrecht', [{ age: 2 }, { age: 5 }, { age: 8 }], ['nl', 'en'], ['en'], '2026-11-10', 12, 30, 340, 0, 1, 'Busy, bike-loving family of five. Lots of cycling, a cat, and plenty of fun.', {}],
  ['garcia@aupair.test', 'Familia García', 'ES', 'Valencia', [{ age: 4 }, { age: 6 }], ['es'], ['en'], '2026-10-25', 9, 30, 320, 1, 0, 'Beach-side family who would love English or Italian at home.', { id: 1 }],
  ['nguyen-smith@aupair.test', 'The Nguyen-Smith Family', 'US', 'Seattle, WA', [{ age: 0 }, { age: 2 }], ['en', 'vi'], ['en'], '2027-01-01', 12, 45, 860, 1, 0, 'Two little ones under three. Infant experience a must; extra pay for a confident driver.', { id: 1, refs: 1, bg: 1 }],
  ['hansen@aupair.test', 'Familien Hansen', 'DK', 'Aarhus', [{ age: 5 }, { age: 10 }], ['da', 'en'], ['en'], '2026-11-01', 12, 30, 4950, 1, 1, 'Danish family near the forest. Kids love football and building Lego.', { id: 1 }],
];
const famIds = families.map(([email, name, country, city, kids, langs, req, start, dur, hours, money, driver, pets, bio, ver]) => {
  const slug = email.split('@')[0];
  const id = addUser(email, 'family', name, country, city, ver, photosFor(slug, (v) => familyPortrait(name, kids.length, v)));
  db.prepare(`INSERT INTO family_profiles (user_id, children, languages, required_languages, start_date, duration_months, weekly_hours,
      pocket_money, needs_driver, has_pets, bio) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, json.str(kids), json.str(langs), json.str(req), start, dur, hours, money, driver, pets, bio);
  return id;
});

// Accepted match + conversation between Maria and the Millers
const accept = (from, to, msg, daysAgo) => {
  const at = new Date(Date.now() - daysAgo * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare("INSERT INTO match_requests (from_user, to_user, message, status, created_at, responded_at) VALUES (?,?,?,'accepted',?,?)").run(from, to, msg, at, at);
  const [a, b] = from < to ? [from, to] : [to, from];
  const c = Number(db.prepare('INSERT INTO conversations (user_a, user_b) VALUES (?,?)').run(a, b).lastInsertRowid);
  db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?,?,?,?)').run(c, from, msg, at);
  return c;
};
const c1 = accept(famIds[0], apIds[0], 'Hi Maria! We loved your profile. Would you like to have a video call this week?', 5);
db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)').run(c1, apIds[0], 'Hello! Yes, I would love that. Thursday evening works for me.');
// The Millers have just started that video call.
db.prepare("INSERT INTO messages (conversation_id, sender_id, body, call_url) VALUES (?,?,'📹 Video call','https://meet.jit.si/PairMundo-demo')").run(c1, famIds[0]);
db.prepare("INSERT INTO match_requests (from_user, to_user, message) VALUES (?,?,?)").run(apIds[1], famIds[1], 'Guten Tag! I have infant experience and speak some German. I would love to meet you.');
db.prepare("INSERT INTO match_requests (from_user, to_user, message) VALUES (?,?,?)").run(famIds[3], apIds[7], 'Hi Ana, your experience is exactly what we need for our three kids!');

// Likes waiting to be swiped back (a like is a pending match request plus a swipe)
const like = (from, to, dir = 'like', msg = null) => {
  db.prepare('INSERT INTO match_requests (from_user, to_user, message) VALUES (?,?,?)').run(from, to, msg);
  db.prepare('INSERT INTO swipes (user_id, target_id, direction) VALUES (?,?,?)').run(from, to, dir);
};
like(apIds[6], famIds[0], 'super', 'Hi! I am a swimming instructor and would love to ski with your kids.');
like(apIds[5], famIds[0]);
like(famIds[6], apIds[0], 'super');
like(famIds[4], apIds[0]);

// A completed past placement with two-way reviews: Thandi with the Nguyen-Smiths
accept(famIds[5], apIds[2], 'Hi Thandi, would you consider joining us?', 400);
const pid = Number(db.prepare(`INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money, status,
    aupair_confirmed, family_confirmed, created_by) VALUES (?,?,?,?,?,?,?,'completed',1,1,?)`)
  .run(apIds[2], famIds[5], 'US', '2025-08-01', '2026-07-31', 45, 848, famIds[5]).lastInsertRowid);
PLACEMENT_TASKS.forEach((t, i) => db.prepare('INSERT INTO placement_tasks (placement_id, title, owner, done, sort) VALUES (?,?,?,1,?)').run(pid, t.title, t.owner, i));
db.prepare('INSERT INTO reviews (placement_id, reviewer_id, reviewee_id, overall, criteria, comment) VALUES (?,?,?,?,?,?)')
  .run(pid, famIds[5], apIds[2], 5, JSON.stringify({ reliability: 5, childcare: 5, communication: 5, household: 4, adaptability: 5 }), 'Thandi was wonderful with our baby and toddler. Punctual, warm and proactive. We miss her!');
db.prepare('INSERT INTO reviews (placement_id, reviewer_id, reviewee_id, overall, criteria, comment, response) VALUES (?,?,?,?,?,?,?)')
  .run(pid, apIds[2], famIds[5], 4, JSON.stringify({ respect: 5, accommodation: 4, communication: 4, fair_hours: 4, support: 5 }), 'Kind family who included me in everything. Schedules sometimes changed last minute, but they always made it up.', 'Thank you Thandi, and fair point on the schedules!');

console.log(`Seeded ${apIds.length} au pairs, ${famIds.length} families, 1 admin into ${file}. Password for all: password123`);
