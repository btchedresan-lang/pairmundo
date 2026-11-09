// Demo accounts for app store review (Apple, Google): a small, closed world of illustrated profiles with matches,
// chats, likes, placements and reviews, so a reviewer can try every feature without real members.
//
// It only runs with DEMO_PASSWORD set (8+ characters). The three reviewer logins below use that password; the other
// demo members get a random one nobody knows. Every demo account is marked users.demo = 1, and demo and real members
// never see each other (see closedApart in app.js). Emails to @demo.pairmundo.com are never sent.
//
// ensureDemoAccounts runs at start-up and every hour. It keeps the reviewer logins working (password, confirmed email,
// not suspended, the Family Pass on the first family) and rebuilds the whole demo world if a reviewer account is missing,
// for example after a reviewer tried account deletion.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword, verifyPassword } from './auth.js';
import { json, tx } from './db.js';
import { aupairPortrait, familyPortrait } from './portraits.js';
import { PROGRAMS, placementTaskList } from './programs.js';

export const DEMO_DOMAIN = 'demo.pairmundo.com';
export const isDemoEmail = (email) => String(email || '').trim().toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
export const DEMO_LOGINS = {
  family: `family@${DEMO_DOMAIN}`, // host family with the Family Pass, so every family feature is open
  family2: `family2@${DEMO_DOMAIN}`, // host family without the Pass, to try the in-app purchase
  aupair: `aupair@${DEMO_DOMAIN}`,
};

const SKIN = { CO: '#d09a6e', PL: '#f6d3b3', ZA: '#5a3820', VN: '#e8b48f', IT: '#e8b48f', GH: '#5a3820', SE: '#f6d3b3', BR: '#a8714a', MX: '#c58c62' };

// [slug, name, country, city, birth, languages, preferred countries, childcare years, age groups, skills, license, available, months, bio, checks]
const AUPAIRS = [
  ['aupair', 'Camila Torres', 'CO', 'Medellín', '2002-03-18', [{ code: 'es', level: 'native' }, { code: 'en', level: 'C1' }, { code: 'de', level: 'A2' }], ['US', 'DE'], 4, ['toddler', 'school'], ['first_aid', 'cooking', 'art'], 1, '2027-01-10', 12,
    'Preschool teaching assistant from Medellín. I love painting, baking arepas with kids and long walks in the park. Looking for a warm family for a year abroad.', { id: 1, refs: 1 }],
  ['maria', 'Maria Gonzalez', 'MX', 'Guadalajara', '2003-04-12', [{ code: 'es', level: 'native' }, { code: 'en', level: 'C1' }], ['US'], 4, ['toddler', 'school'], ['first_aid', 'cooking', 'swimming'], 1, '2027-01-10', 12,
    'Early-childhood education student who has nannied for two families. I love crafts, outdoor play and teaching Spanish through songs.', { id: 1, refs: 1, bg: 1 }],
  ['thandi', 'Thandi Mokoena', 'ZA', 'Cape Town', '2001-02-20', [{ code: 'en', level: 'native' }, { code: 'af', level: 'C1' }], ['US'], 5, ['infant', 'toddler', 'school'], ['first_aid', 'swimming', 'tutoring'], 1, '2027-03-01', 12,
    'Five years at a daycare centre, lifeguard certified, and an avid hiker.', { id: 1, refs: 1, bg: 1 }],
  ['kofi', 'Kofi Mensah', 'GH', 'Accra', '2003-08-08', [{ code: 'en', level: 'native' }, { code: 'fr', level: 'B1' }], ['US', 'CA'], 3, ['school', 'teen'], ['sports', 'tutoring', 'first_aid'], 1, '2026-12-15', 12,
    'Youth football coach and big brother to four. Great with energetic school-age kids.', { id: 1, refs: 1 }],
  ['emma', 'Emma Johansson', 'SE', 'Gothenburg', '2005-01-25', [{ code: 'sv', level: 'native' }, { code: 'en', level: 'C2' }, { code: 'de', level: 'A2' }], ['DE', 'AU', 'US'], 2, ['toddler', 'school'], ['swimming', 'music'], 1, '2027-01-05', 12,
    'Gap year before university. Swimming instructor, guitar player, loves the outdoors.', { id: 1 }],
  ['anna', 'Anna Kowalska', 'PL', 'Kraków', '2001-09-03', [{ code: 'pl', level: 'native' }, { code: 'en', level: 'B2' }, { code: 'de', level: 'B1' }], ['DE', 'NL', 'US'], 3, ['infant', 'toddler'], ['first_aid', 'cooking'], 1, '2027-01-10', 12,
    'Nursing graduate with infant experience. Calm, organised and happy to help with light housework.', { id: 1, refs: 1 }],
  ['linh', 'Linh Nguyen', 'VN', 'Hanoi', '2002-06-30', [{ code: 'vi', level: 'native' }, { code: 'en', level: 'C1' }, { code: 'fr', level: 'B1' }], ['FR', 'US'], 2, ['school', 'teen'], ['tutoring', 'music', 'cooking'], 0, '2027-02-01', 10,
    'Maths tutor and piano player. I want to improve my French and share Vietnamese culture.', { id: 1 }],
  ['sofia', 'Sofia Rossi', 'IT', 'Bologna', '2000-11-11', [{ code: 'it', level: 'native' }, { code: 'en', level: 'B2' }, { code: 'es', level: 'B2' }], ['ES', 'FR', 'US'], 2, ['toddler', 'school'], ['cooking', 'art'], 1, '2027-02-15', 9,
    'Art student who loves cooking with kids. Patient, cheerful and flexible.', {}],
  ['ana', 'Ana Souza', 'BR', 'Curitiba', '1999-05-14', [{ code: 'pt', level: 'native' }, { code: 'en', level: 'C1' }, { code: 'es', level: 'B2' }], ['NL', 'DK', 'NO'], 6, ['infant', 'toddler', 'school'], ['first_aid', 'cooking', 'tutoring'], 1, '2027-01-01', 12,
    'Pedagogy graduate, six years in childcare. Looking for a Scandinavian or Dutch family.', { id: 1, refs: 1, bg: 1 }],
];

// [slug, name, country, city, children, home languages, required languages, start, months, hours, pocket money, driver, pets, bio, checks]
const FAMILIES = [
  ['family', 'The Rivera Family', 'US', 'Austin, TX', [{ age: 4 }, { age: 7 }], ['en', 'es'], ['en'], '2027-01-10', 12, 45, 848, 1, 1,
    'Two curious kids, a lazy beagle and a backyard full of tomato plants. We love bike rides, Saturday pancakes and trips to the lake.', { id: 1, refs: 1 }],
  ['family2', 'The Okafor Family', 'US', 'Boston, MA', [{ age: 2 }, { age: 6 }], ['en'], ['en'], '2027-02-01', 12, 40, 848, 0, 0,
    'Two doctors with a busy toddler and a first-grader who loves dinosaurs. Looking for a kind, patient au pair to join us in Boston.', { id: 1 }],
  ['millers', 'The Miller Family', 'US', 'Denver, CO', [{ age: 3 }, { age: 7 }], ['en'], ['en'], '2026-12-01', 12, 45, 848, 1, 1,
    'Two kids, a golden retriever and a love for skiing. Looking for an outdoorsy au pair to join us.', { id: 1, refs: 1 }],
  ['schmidt', 'Familie Schmidt', 'DE', 'Hamburg', [{ age: 1 }, { age: 4 }], ['de', 'en'], ['en'], '2027-01-15', 12, 30, 280, 0, 0,
    'Doctors in Hamburg with a toddler and a baby. We value calm, reliability and some German.', { id: 1 }],
  ['devries', 'Familie de Vries', 'NL', 'Utrecht', [{ age: 2 }, { age: 5 }, { age: 8 }], ['nl', 'en'], ['en'], '2027-01-10', 12, 30, 340, 0, 1,
    'Busy, bike-loving family of five. Lots of cycling, a cat, and plenty of fun.', {}],
  ['garcia', 'Familia García', 'ES', 'Valencia', [{ age: 4 }, { age: 6 }], ['es'], ['en'], '2027-03-01', 9, 30, 320, 1, 0,
    'Beach-side family who would love English or Italian at home.', { id: 1 }],
  ['nguyensmith', 'The Nguyen-Smith Family', 'US', 'Seattle, WA', [{ age: 0 }, { age: 2 }], ['en', 'vi'], ['en'], '2027-01-01', 12, 45, 860, 1, 0,
    'Two little ones under three. Infant experience a must; extra pay for a confident driver.', { id: 1, refs: 1, bg: 1 }],
  ['hansen', 'Familien Hansen', 'DK', 'Aarhus', [{ age: 5 }, { age: 10 }], ['da', 'en'], ['en'], '2027-02-01', 12, 30, 5250, 1, 1,
    'Danish family near the forest. Kids love football and building Lego.', { id: 1 }],
  ['dupont', 'Famille Dupont', 'FR', 'Lyon', [{ age: 9 }, { age: 12 }], ['fr'], ['en'], '2027-02-01', 10, 25, 350, 0, 0,
    'We want our kids to practise English. School pick-ups, homework help and weekend museum trips.', { id: 1, refs: 1 }],
];

const ago = (days, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600000).toISOString().replace('T', ' ').slice(0, 19);

/** Removes every demo account and what hangs off it (same order as account deletion in app.js). Call inside a transaction. */
export function wipeDemo(db) {
  const ids = db.prepare('SELECT id FROM users WHERE demo = 1').all().map((r) => r.id);
  if (!ids.length) return 0;
  const inIds = `(${ids.map(() => '?').join(',')})`;
  {
    const placements = `SELECT id FROM placements WHERE aupair_id IN ${inIds} OR family_id IN ${inIds}`;
    const reviews = `SELECT id FROM reviews WHERE reviewer_id IN ${inIds} OR reviewee_id IN ${inIds} OR placement_id IN (${placements})`;
    db.prepare(`DELETE FROM reports WHERE reporter_id IN ${inIds} OR target_user_id IN ${inIds} OR review_id IN (${reviews})`).run(...ids, ...ids, ...ids, ...ids, ...ids, ...ids);
    db.prepare(`DELETE FROM reviews WHERE id IN (${reviews})`).run(...ids, ...ids, ...ids, ...ids);
    db.prepare(`DELETE FROM placements WHERE aupair_id IN ${inIds} OR family_id IN ${inIds} OR created_by IN ${inIds}`).run(...ids, ...ids, ...ids);
    db.prepare(`DELETE FROM users WHERE id IN ${inIds}`).run(...ids);
  }
  return ids.length;
}

function buildDemo(db, { password, uploadDir }) {
  mkdirSync(uploadDir, { recursive: true });
  const reviewerHash = hashPassword(password);
  const otherHash = () => hashPassword(randomBytes(24).toString('hex'));
  const photos = (slug, make) => [0, 1, 2].map((v) => {
    const name = `demo-${slug}-${v}.svg`;
    writeFileSync(join(uploadDir, name), make(v));
    return `/uploads/${name}`;
  });
  const addUser = (slug, role, name, country, city, checks, pics) => {
    const reviewer = !!DEMO_LOGINS[slug];
    return Number(db.prepare(`INSERT INTO users (email, password_hash, role, name, country, city, photo_url, photos, id_verified, references_checked,
        background_checked, email_verified, lang, demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,'en',1)`)
      .run(`${slug}@${DEMO_DOMAIN}`, reviewer ? reviewerHash : otherHash(), role, name, country, city, pics[0], JSON.stringify(pics),
        checks.id ? 1 : 0, checks.refs ? 1 : 0, checks.bg ? 1 : 0).lastInsertRowid);
  };

  const ap = {};
  for (const [slug, name, country, city, birth, langs, prefs, years, groups, skills, driver, avail, months, bio, checks] of AUPAIRS) {
    const id = addUser(slug, 'aupair', name, country, city, checks, photos(slug, (v) => aupairPortrait(name, v, { skin: SKIN[country] })));
    db.prepare(`INSERT INTO aupair_profiles (user_id, birth_date, nationality, languages, preferred_countries, childcare_years, age_groups, skills,
        drivers_license, available_from, duration_months, education, bio) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, birth, country, json.str(langs), json.str(prefs), years, json.str(groups), json.str(skills), driver, avail, months, 'University', bio);
    ap[slug] = id;
  }
  db.prepare('UPDATE aupair_profiles SET certificates = ? WHERE user_id = ?')
    .run(json.str([{ kind: 'cpr', detail: 'Cruz Roja Colombiana, 2026' }, { kind: 'language', detail: 'IELTS 7.0' }]), ap.aupair);
  const fam = {};
  for (const [slug, name, country, city, kids, langs, req, start, months, hours, money, driver, pets, bio, checks] of FAMILIES) {
    const id = addUser(slug, 'family', name, country, city, checks, photos(slug, (v) => familyPortrait(name, kids.length, v)));
    db.prepare(`INSERT INTO family_profiles (user_id, children, languages, required_languages, start_date, duration_months, weekly_hours,
        pocket_money, needs_driver, has_pets, bio) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, json.str(kids), json.str(langs), json.str(req), start, months, hours, money, driver, pets, bio);
    fam[slug] = id;
  }

  // A match with a chat. msgs: [sender, text, days ago, hours ago]
  const match = (from, to, msgs) => {
    const at = ago(msgs[0][2], msgs[0][3] || 0);
    db.prepare("INSERT INTO match_requests (from_user, to_user, message, status, created_at, responded_at) VALUES (?,?,?,'accepted',?,?)").run(from, to, msgs[0][1], at, at);
    db.prepare('INSERT INTO swipes (user_id, target_id, direction, created_at) VALUES (?,?,?,?), (?,?,?,?)').run(from, to, 'like', at, to, from, 'like', at);
    const [a, b] = from < to ? [from, to] : [to, from];
    const c = Number(db.prepare('INSERT INTO conversations (user_a, user_b, created_at) VALUES (?,?,?)').run(a, b, at).lastInsertRowid);
    for (const [sender, body, d, h = 0] of msgs) db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?,?,?,?)').run(c, sender, body, ago(d, h));
  };
  // A like waiting to be swiped back.
  const like = (from, to, dir = 'like', msg = null, d = 1) => {
    db.prepare('INSERT INTO match_requests (from_user, to_user, message, created_at) VALUES (?,?,?,?)').run(from, to, msg, ago(d));
    db.prepare('INSERT INTO swipes (user_id, target_id, direction, created_at) VALUES (?,?,?,?)').run(from, to, dir, ago(d));
  };
  const placement = (aupair, family, country, start, end, hours, money, status, createdBy, { aupairOk = 1, familyOk = 1, done = false } = {}) => {
    const id = Number(db.prepare(`INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money, status,
        aupair_confirmed, family_confirmed, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(aupair, family, country, start, end, hours, money, status, aupairOk, familyOk, createdBy).lastInsertRowid);
    const nationality = db.prepare('SELECT nationality FROM aupair_profiles WHERE user_id = ?').get(aupair).nationality;
    placementTaskList(PROGRAMS.find((p) => p.code === country), nationality, start, end).forEach((t, i) => db.prepare(
      'INSERT INTO placement_tasks (placement_id, title, owner, due_date, done, sort, link) VALUES (?,?,?,?,?,?,?)')
      .run(id, t.title, t.owner, t.due_date, done || i < 2 ? 1 : 0, i, t.link || null));
    return id;
  };
  const review = (placementId, from, to, criteria, comment, d) => {
    const vals = Object.values(criteria);
    const score = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    db.prepare('INSERT INTO reviews (placement_id, reviewer_id, reviewee_id, overall, score, criteria, comment, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(placementId, from, to, Math.round(score), score, JSON.stringify(criteria), comment, ago(d));
  };
  const terms = (extra) => JSON.stringify({ days_off: 1.5, paid_leave_weeks: 2, notice_weeks: 2, language_support: 'USD 500 toward classes at a local college',
    duties: 'Getting the kids ready for school, school pick-ups, homework help, playtime and the children\'s laundry.',
    house_rules: 'Guests are welcome until 22:00 on weekdays. Please tell us if you will be away overnight.', ...extra });

  // ---- The Rivera Family (reviewer, with the Family Pass) ----
  // A completed placement with Thandi: she reviewed them, and the family can still write their review.
  match(fam.family, ap.thandi, [[fam.family, 'Hi Thandi! Would you like to spend a year with us in Austin?', 420], [ap.thandi, 'Hello! I would love to. Can we have a video call?', 419]]);
  const past = placement(ap.thandi, fam.family, 'US', '2025-09-01', '2026-08-31', 45, 848, 'completed', fam.family, { done: true });
  review(past, ap.thandi, fam.family, { respect: 5, agreement: 5, accommodation: 4, support: 5, communication: 5, accuracy: 5 },
    'The Riveras treated me like family. Lovely kids, my own room and a lot of help settling in. I would do it again!', 60);
  // A confirmed placement with Maria starting in January: checklist under way, Maria has signed the agreement, the family still has to.
  match(fam.family, ap.maria, [
    [fam.family, 'Hi Maria! Your profile is lovely. Would you have time for a video call this week?', 9],
    [ap.maria, 'Hello! Yes, I would love that. Thursday evening works for me.', 9, -2],
    [fam.family, 'Perfect, Thursday at 7pm your time. The kids are excited to meet you!', 8],
    [ap.maria, 'Thank you for the call, it was so nice to meet everyone. I would be very happy to join you in January!', 6],
    [fam.family, 'We loved meeting you too. We just sent the placement, have a look when you can.', 5],
    [ap.maria, 'Confirmed and I signed the agreement. See you in Austin! 🎉', 3],
  ]);
  const upcoming = placement(ap.maria, fam.family, 'US', '2027-01-10', '2028-01-09', 45, 848, 'confirmed', fam.family);
  db.prepare("INSERT INTO placement_agreements (placement_id, terms, aupair_signed_name, aupair_signed_at) VALUES (?, ?, 'Maria Gonzalez', ?)").run(upcoming, terms({}), ago(3));
  // A fresh match with Kofi, and likes waiting from Emma (super like) and Anna.
  match(ap.kofi, fam.family, [[ap.kofi, 'Hi! I coach youth football and your kids look like they would love it. Happy to talk anytime.', 2], [fam.family, 'Hi Kofi! Our 7-year-old just joined a team. Tell us more about you!', 1, 20]]);
  like(ap.emma, fam.family, 'super', 'Hi! I teach swimming and play guitar. Your lake trips sound wonderful!', 1);
  like(ap.anna, fam.family, 'like', null, 2);

  // ---- Camila Torres (reviewer au pair) ----
  // Matched with the Rivera Family (the other reviewer login), so messages between the two accounts can be tried.
  match(fam.family, ap.aupair, [[fam.family, 'Hi Camila! We would love to know more about you. What do you like to do with kids?', 4], [ap.aupair, 'Hi! Painting, baking and lots of outdoor games. Your backyard looks perfect for that!', 3]]);
  // Familie Schmidt proposed a placement she can confirm.
  match(fam.schmidt, ap.aupair, [
    [fam.schmidt, 'Hallo Camila! We are a family in Hamburg with a toddler and a baby. Would you like to talk?', 7],
    [ap.aupair, 'Hallo! Yes please, I am learning German and would love to live in Hamburg.', 7, -3],
    [fam.schmidt, 'Wonderful. We sent you a placement for March. Take your time to look at it.', 2],
  ]);
  placement(ap.aupair, fam.schmidt, 'DE', '2027-03-01', '2028-02-29', 30, 280, 'proposed', fam.schmidt, { aupairOk: 0, familyOk: 1 });
  // A completed summer placement with Familia García: they reviewed her, and she can still write hers.
  match(fam.garcia, ap.aupair, [[fam.garcia, '¡Hola Camila! Would you like to spend the summer with us in Valencia?', 200], [ap.aupair, '¡Claro que sí! I would love to.', 199]]);
  const summer = placement(ap.aupair, fam.garcia, 'ES', '2026-06-01', '2026-08-31', 30, 320, 'completed', fam.garcia, { done: true });
  review(summer, fam.garcia, ap.aupair, { childcare: 5, reliability: 5, communication: 5, household: 4, adaptability: 5, accuracy: 5 },
    'Camila was wonderful with our boys: patient, creative and always on time. They still ask when she is coming back.', 50);
  like(fam.millers, ap.aupair, 'super', 'Hi Camila! Your art projects look amazing. Would you like to ski with us in Denver?', 1);
  like(fam.devries, ap.aupair, 'like', null, 2);

  // ---- The Okafor Family (reviewer, without the Pass) ----
  // Two au pairs liked them (who stays hidden until they get the Pass), and a match with Linh to message once they have it.
  like(ap.sofia, fam.family2, 'like', null, 1);
  like(ap.thandi, fam.family2, 'super', 'Hi! I have years of daycare experience with toddlers. I would love to meet you.', 2);
  match(ap.linh, fam.family2, [[ap.linh, 'Hello! I tutor maths and play piano. I would love to help your daughter with reading too.', 3]]);

  // ---- Some life between the other demo members, so reviews and ratings show on their profiles ----
  const nsPlacement = placement(ap.ana, fam.nguyensmith, 'US', '2025-08-01', '2026-07-31', 45, 860, 'completed', fam.nguyensmith, { done: true });
  review(nsPlacement, fam.nguyensmith, ap.ana, { childcare: 5, reliability: 5, communication: 5, household: 4, adaptability: 5, accuracy: 5 }, 'Ana was wonderful with our baby and toddler. Punctual, warm and proactive. We miss her!', 90);
  review(nsPlacement, ap.ana, fam.nguyensmith, { respect: 5, agreement: 4, accommodation: 4, support: 5, communication: 4, accuracy: 4 }, 'Kind family who included me in everything. Schedules sometimes changed, but they always made it up.', 88);
}

/** Keeps the reviewer logins working and builds the demo world if it is missing. Returns what it did. */
export function ensureDemoAccounts(db, { password = process.env.DEMO_PASSWORD, uploadDir = process.env.UPLOAD_DIR || 'data/uploads' } = {}) {
  if (!password) return 'off';
  if (String(password).length < 8) { console.error('DEMO_PASSWORD must be at least 8 characters; demo accounts are off.'); return 'off'; }
  const emails = Object.values(DEMO_LOGINS);
  const found = db.prepare(`SELECT * FROM users WHERE email IN (${emails.map(() => '?').join(',')}) AND demo = 1`).all(...emails);
  let action = 'ok';
  if (found.length < emails.length) {
    // An account with a demo email that isn't marked demo would be someone's real account: leave it alone.
    if (db.prepare(`SELECT 1 FROM users WHERE email IN (${emails.map(() => '?').join(',')}) AND demo = 0`).get(...emails)) {
      console.error('A non-demo account uses a demo email; demo accounts were not rebuilt.');
      return 'conflict';
    }
    tx(db, () => { wipeDemo(db); buildDemo(db, { password, uploadDir }); });
    action = 'built';
  }
  const users = db.prepare(`SELECT * FROM users WHERE email IN (${emails.map(() => '?').join(',')}) AND demo = 1`).all(...emails);
  for (const u of users) {
    // A reviewer may change the password, confirm, or get suspended by a report: put the login back.
    if (!verifyPassword(password, u.password_hash)) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), u.id);
    db.prepare('UPDATE users SET email_verified = 1, suspended = 0 WHERE id = ?').run(u.id);
  }
  const passFamily = users.find((u) => u.email === DEMO_LOGINS.family);
  if (passFamily && !db.prepare("SELECT 1 FROM passes WHERE user_id = ? AND ends_at > datetime('now', '+30 days')").get(passFamily.id)) {
    db.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?, 'admin', ?, datetime('now'), datetime('now', '+1 year'))")
      .run(passFamily.id, `demo-${Date.now()}`);
  }
  return action;
}
