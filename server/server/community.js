// Community Managers: paid people (often former au pairs, never current ones) who each run one city's community of au
// pairs and host families by hosting meetups in public places. The admin assigns the role to an account and a city,
// and sets the pay; the manager hosts from their own page and shows a QR code at each meetup, which people scan to
// check in. Pay is worked out from what the app can measure, so nobody has to take anyone's word for it:
//
// - A successful event has at least min_checkins check-ins, at least min_newcomers of them new to the city's community
//   (their first check-in there), and an average of min_rating stars or more from at least min_ratings ratings. It is
//   scored once ratings close, rating_days after the start.
// - Retainer: paid for a month once the manager held min_events events in it (first_month_min in their first month).
//   An event is held when it wasn't cancelled and at least one person checked in. trial_retainer replaces it for
//   months that start on or before trial_until.
// - event_fee for each successful event, up to max_paid_events a month.
// - newcomer_fee for each newcomer at those paid events.
// - family_pass_fee for each family whose first check-in at a Community Manager's event was at this manager's, and who
//   then bought their first Family Pass within pass_days. It counts in the month the pass was bought.
//
// Amounts are kept in minor units (öre, cents) in the manager's own currency. Months are calendar months in UTC.
import { randomBytes } from 'node:crypto';
import { cityKey } from './nearby.js';

const PAID_PASS_SOURCES = ['apple', 'google', 'stripe'];
const CURRENCIES = ['SEK', 'EUR', 'USD', 'COP', 'BRL', 'MXN', 'ZAR', 'PHP', 'NOK', 'DKK', 'GBP', 'CHF'];
const RULE_KEYS = { min_checkins: [1, 500], min_newcomers: [0, 500], min_rating: [1, 5], min_ratings: [1, 500], rating_days: [1, 14], pass_days: [1, 365] };
const MONEY_KEYS = ['retainer', 'trial_retainer', 'event_fee', 'newcomer_fee', 'family_pass_fee'];
const COUNT_KEYS = { min_events: [0, 31], first_month_min: [0, 31], target_events: [0, 31], max_paid_events: [0, 31] };

/** "2026-11-23 10:00:00" (SQLite) or an ISO string, as ms. */
const ms = (t) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(t) ? t : `${String(t).replace(' ', 'T')}Z`);
const monthOf = (t) => new Date(ms(t)).toISOString().slice(0, 7);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function mountCommunity(api, deps) {
  const { db, wrap, requireAuth, requireRole, HttpError, str, normEmail, hashPassword, mailer, withMedia, publicBase, notify, csvCell, shortName } = deps;
  const bad = (m) => new HttpError(400, m);
  const notFound = () => new HttpError(404, 'Not found.');
  const admin = requireRole('admin');

  const rules = () => db.prepare('SELECT * FROM community_rules WHERE id = 1').get();
  const managerRow = (userId) => db.prepare('SELECT * FROM community_managers WHERE user_id = ?').get(userId);
  /** The active Community Manager behind an account, or null. */
  const managerOf = (u) => {
    if (!u || u.role !== 'ambassador' || u.suspended) return null;
    const cm = managerRow(u.id);
    return cm?.active ? cm : null;
  };

  // ---------- scoring ----------
  /** How one of a manager's events is doing against the rules. status: upcoming | cancelled | hidden | scoring (ratings
   *  still open) | success | not_met. Only real (not demo, not suspended) members count. */
  const scoreOf = (m, r = rules()) => {
    const now = Date.now();
    const c = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(c.newcomer), 0) newcomers FROM meetup_checkins c JOIN users u ON u.id = c.user_id
      WHERE c.meetup_id = ? AND u.suspended = 0 AND u.demo = ?`).get(m.id, m.demo ? 1 : 0);
    const rt = db.prepare(`SELECT COUNT(*) n, AVG(stars) avg FROM meetup_ratings x JOIN users u ON u.id = x.user_id
      WHERE x.meetup_id = ? AND u.suspended = 0 AND u.demo = ?`).get(m.id, m.demo ? 1 : 0);
    const rating = rt.avg == null ? null : Math.round(rt.avg * 100) / 100;
    const closes = Date.parse(m.starts_at) + r.rating_days * 86400e3;
    const misses = [];
    if (c.n < r.min_checkins) misses.push(`${c.n} of ${r.min_checkins} check-ins`);
    if (c.newcomers < r.min_newcomers) misses.push(`${c.newcomers} of ${r.min_newcomers} newcomers`);
    if (rt.n < r.min_ratings) misses.push(`${rt.n} of ${r.min_ratings} ratings`);
    else if (rating < r.min_rating) misses.push(`rated ${rating} (needs ${r.min_rating})`);
    const status = m.status === 'cancelled' ? 'cancelled' : m.status === 'hidden' ? 'hidden' : now < Date.parse(m.starts_at) ? 'upcoming'
      : now < closes ? 'scoring' : misses.length ? 'not_met' : 'success';
    return { id: m.id, title: m.title, kind: m.kind, audience: m.audience, starts_at: m.starts_at, place: m.place, status, checkins: c.n, newcomers: c.newcomers,
      ratings: rt.n, rating, misses, scored_at: new Date(closes).toISOString(), held: !['cancelled', 'hidden'].includes(m.status) && now >= Date.parse(m.starts_at) && c.n > 0 };
  };
  const eventsIn = (cm, month) => db.prepare(`SELECT * FROM meetups WHERE source = 'community' AND host_id = ? AND substr(starts_at, 1, 7) = ? ORDER BY starts_at`).all(cm.user_id, month);

  /** Families whose first check-in at any Community Manager's event was at this manager's, and who then bought their
   *  first paid Family Pass within pass_days, with the month it was bought. */
  const familyPasses = (cm, r = rules()) => {
    const firsts = db.prepare(`SELECT c.user_id, MIN(c.created_at) first_at FROM meetup_checkins c JOIN meetups m ON m.id = c.meetup_id JOIN users u ON u.id = c.user_id
      WHERE m.source = 'community' AND u.role = 'family' AND u.suspended = 0 AND u.demo = 0 GROUP BY c.user_id`).all();
    const out = [];
    for (const f of firsts) {
      const host = db.prepare(`SELECT m.host_id FROM meetup_checkins c JOIN meetups m ON m.id = c.meetup_id WHERE c.user_id = ? AND c.created_at = ? AND m.source = 'community' LIMIT 1`).get(f.user_id, f.first_at)?.host_id;
      if (host !== cm.user_id) continue;
      const pass = db.prepare(`SELECT MIN(created_at) at FROM passes WHERE user_id = ? AND source IN (${PAID_PASS_SOURCES.map(() => '?').join(',')})`).get(f.user_id, ...PAID_PASS_SOURCES)?.at;
      if (!pass) continue;
      const gap = ms(pass) - ms(f.first_at);
      if (gap >= 0 && gap <= r.pass_days * 86400e3) out.push({ user_id: f.user_id, checked_in_at: f.first_at, bought_at: pass, month: monthOf(pass) });
    }
    return out;
  };

  /** What a manager earned in a month, line by line. final is false while some events are still being rated. */
  const monthSummary = (cm, month, r = rules()) => {
    const events = eventsIn(cm, month).map((m) => scoreOf(m, r));
    const started = String(cm.started_on).slice(0, 7);
    const before = month < started;
    const firstMonth = month === started;
    const required = firstMonth ? cm.first_month_min : cm.min_events;
    const held = events.filter((e) => e.held).length;
    const successful = events.filter((e) => e.status === 'success');
    const paid = successful.slice(0, cm.max_paid_events);
    const trial = !!cm.trial_until && `${month}-01` <= cm.trial_until;
    const retainerEarned = !before && held >= required;
    const retainer = retainerEarned ? (trial ? cm.trial_retainer : cm.retainer) : 0;
    const newcomers = paid.reduce((s, e) => s + e.newcomers, 0);
    const passes = familyPasses(cm, r).filter((p) => p.month === month);
    const lines = {
      retainer: { earned: retainerEarned, trial, amount: retainer, held, required },
      events: { successful: successful.length, paid: paid.length, cap: cm.max_paid_events, rate: cm.event_fee, amount: paid.length * cm.event_fee },
      newcomers: { count: newcomers, rate: cm.newcomer_fee, amount: newcomers * cm.newcomer_fee },
      family_passes: { count: passes.length, rate: cm.family_pass_fee, amount: passes.length * cm.family_pass_fee },
    };
    const total = lines.retainer.amount + lines.events.amount + lines.newcomers.amount + lines.family_passes.amount;
    const payout = db.prepare('SELECT * FROM community_payouts WHERE user_id = ? AND month = ?').get(cm.user_id, month);
    return { month, currency: cm.currency, first_month: firstMonth, target: cm.target_events, events, lines, total,
      final: !events.some((e) => e.status === 'scoring' || e.status === 'upcoming') && month < thisMonth(),
      paid: payout ? { amount: payout.amount, paid_at: payout.paid_at } : null };
  };

  const managerView = (cm) => {
    const u = db.prepare('SELECT id, name, email, suspended FROM users WHERE id = ?').get(cm.user_id);
    return { ...cm, active: !!cm.active, name: u?.name, email: u?.email };
  };

  // ---------- the manager's own page ----------
  const mine = (req) => {
    const cm = managerOf(req.user);
    if (!cm) throw new HttpError(403, 'This page is for PairMundo Community Managers.');
    return cm;
  };
  api.get('/community/me', requireAuth, wrap((req) => {
    const cm = mine(req), r = rules();
    const prev = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const since = new Date(Date.now() - 62 * 86400e3).toISOString();
    return {
      manager: { name: String(req.user.name).split(/\s+/)[0], city: cm.city, country: cm.country, currency: cm.currency, started_on: cm.started_on, trial_until: cm.trial_until,
        pay: Object.fromEntries([...MONEY_KEYS, ...Object.keys(COUNT_KEYS)].map((k) => [k, cm[k]])) },
      rules: r,
      this_month: monthSummary(cm, thisMonth(), r),
      last_month: monthSummary(cm, prev, r),
      // Upcoming and recent events, with their check-in links for the host.
      events: db.prepare(`SELECT * FROM meetups WHERE source = 'community' AND host_id = ? AND starts_at >= ? ORDER BY starts_at DESC LIMIT 60`).all(cm.user_id, since)
        .map((m) => ({ ...scoreOf(m, r), checkin_code: m.checkin_code, checkin_url: `${publicBase()}/#/checkin/${m.id}/${m.checkin_code}`, qr: `/api/meetups/${m.id}/qr.svg`,
          going: db.prepare('SELECT COUNT(*) n FROM meetup_attendees WHERE meetup_id = ?').get(m.id).n, max_people: m.max_people,
          comments: db.prepare("SELECT stars, comment FROM meetup_ratings WHERE meetup_id = ? AND comment IS NOT NULL AND comment != '' ORDER BY created_at DESC LIMIT 20").all(m.id) })),
      payouts: db.prepare('SELECT month, currency, amount, paid_at FROM community_payouts WHERE user_id = ? ORDER BY month DESC LIMIT 24').all(cm.user_id),
      community: db.prepare(`SELECT u.role, COUNT(*) n FROM nearby_settings n JOIN users u ON u.id = n.user_id WHERE n.country = ? AND n.city_key = ? AND u.demo = 0 AND u.suspended = 0 GROUP BY u.role`)
        .all(cm.country, cm.city_key),
    };
  }));

  // ---------- admin ----------
  const money = (v, label) => {
    const n = Math.round(Number(String(v).replace(/\s/g, '').replace(',', '.')) * 100);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) throw bad(`${label} is an amount, like 4000 or 99.50.`);
    return n;
  };
  const LABELS = { retainer: 'The monthly retainer', trial_retainer: 'The trial retainer', event_fee: 'The pay per successful event', newcomer_fee: 'The pay per newcomer', family_pass_fee: 'The pay per family who buys a pass',
    min_events: 'Events needed for the retainer', first_month_min: 'Events needed in the first month', target_events: 'The monthly target', max_paid_events: 'Paid events a month' };
  /** Reads the manager fields in a request, over what's there already. Money comes in major units (kronor, euros). */
  const readManager = (b, cur = {}) => {
    const out = {};
    if ('city' in b || !cur.city) {
      const city = str(b.city, 80);
      if (!city || !cityKey(city)) throw bad('Which city do they run?');
      out.city = city; out.city_key = cityKey(city);
    }
    if ('country' in b || !cur.country) {
      const c = String(b.country || '').toUpperCase();
      if (!/^[A-Z]{2}$/.test(c)) throw bad('Pick the country.');
      out.country = c;
    }
    if ('currency' in b) {
      const c = String(b.currency || '').toUpperCase();
      if (!CURRENCIES.includes(c)) throw bad(`Pay them in one of ${CURRENCIES.join(', ')}.`);
      out.currency = c;
    }
    for (const k of MONEY_KEYS) if (k in b && b[k] !== '') out[k] = money(b[k], LABELS[k]);
    for (const [k, [lo, hi]] of Object.entries(COUNT_KEYS)) {
      if (!(k in b) || b[k] === '') continue;
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${LABELS[k]} is a whole number from ${lo} to ${hi}.`);
      out[k] = n;
    }
    for (const k of ['started_on', 'trial_until']) {
      if (!(k in b)) continue;
      const v = String(b[k] ?? '');
      if (k === 'trial_until' && !v) { out.trial_until = null; continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad(k === 'started_on' ? 'Pick the day they start.' : 'Pick the last day of the trial, or leave it empty.');
      out[k] = v;
    }
    if ('notes' in b) out.notes = str(b.notes, 2000) || null;
    if ('active' in b) out.active = b.active && b.active !== 'false' ? 1 : 0;
    return out;
  };

  api.get('/admin/community', admin, wrap((req) => {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : thisMonth();
    const r = rules();
    return {
      month, rules: r, currencies: CURRENCIES,
      managers: db.prepare('SELECT * FROM community_managers ORDER BY active DESC, city').all().map((cm) => ({ ...managerView(cm), summary: monthSummary(cm, month, r) })),
    };
  }));

  /** Gives someone the Community Manager role. They get their own account (never an au pair or family account), and
   *  an email to set their password. */
  api.post('/admin/community/managers', admin, wrap((req, res) => {
    const b = req.body || {};
    const email = normEmail(b.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email.');
    const name = str(b.name, 120);
    if (!name) throw bad('Their name is required.');
    let user = db.prepare('SELECT * FROM users WHERE lower(trim(email)) = ?').get(email);
    if (user && user.role !== 'ambassador') {
      throw new HttpError(409, 'That email already has an au pair, family, agency or staff account. Community Managers need their own account: use another email.');
    }
    if (user && managerRow(user.id)) throw new HttpError(409, 'They are already a Community Manager. Edit them below instead.');
    const fields = readManager({ started_on: new Date().toISOString().slice(0, 10), ...b });
    const created = !user;
    if (!user) {
      const id = db.prepare("INSERT INTO users (email, password_hash, role, name, country, email_verified) VALUES (?,?, 'ambassador', ?, ?, 1)")
        .run(email, hashPassword(randomBytes(24).toString('hex')), name, fields.country).lastInsertRowid;
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    const row = { user_id: user.id, started_on: new Date().toISOString().slice(0, 10), ...fields };
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO community_managers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((k) => row[k]));
    db.prepare('UPDATE users SET suspended = 0 WHERE id = ?').run(user.id);
    const cm = managerRow(user.id);
    const first = name.split(/\s+/)[0];
    Promise.resolve(mailer({ to: email, ...withMedia({
      subject: `Welcome to PairMundo, Community Manager for ${cm.city}`,
      text: [`Hello ${first},`, '',
        `Welcome aboard! You're now PairMundo's Community Manager for ${cm.city}. Your page shows your events, the QR code to show at each one, who checked in, how each event scored and what you've earned this month.`, '',
        created ? 'To sign in the first time, set your password here. Choose "Forgot password", enter this email address and use the code we send you:' : 'Sign in with your usual PairMundo account:',
        `${publicBase()}/#/${created ? 'forgot' : 'community'}`, '',
        `Your sign-in email: ${email}`, '',
        'Badji', 'Co-founder & Partnerships, PairMundo'].join('\n'),
    }, { image: 'community-meetups.jpg', alt: 'PairMundo meetups: au pairs and host families meeting in their city', base: publicBase() }) }))
      .catch((e) => console.error('Email failed:', e.message));
    notify(user.id, 'ambassador', 'You are now the PairMundo Community Manager for {city}. Host your first meetup from your page.', { city: cm.city }, '#/community');
    res.status(201);
    return managerView(cm);
  }));

  api.put('/admin/community/managers/:userId', admin, wrap((req) => {
    const cm = managerRow(Number(req.params.userId));
    if (!cm) throw notFound();
    const fields = readManager(req.body || {}, cm);
    const cols = Object.keys(fields);
    if (cols.length) db.prepare(`UPDATE community_managers SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...cols.map((k) => fields[k]), cm.user_id);
    return managerView(managerRow(cm.user_id));
  }));

  api.put('/admin/community/rules', admin, wrap((req) => {
    const b = req.body || {}, cur = rules(), next = {};
    for (const [k, [lo, hi]] of Object.entries(RULE_KEYS)) {
      const v = k in b && b[k] !== '' ? Number(b[k]) : cur[k];
      if (!Number.isFinite(v) || v < lo || v > hi || (k !== 'min_rating' && !Number.isInteger(v))) throw bad(`${k.replace(/_/g, ' ')} goes from ${lo} to ${hi}.`);
      next[k] = k === 'min_rating' ? Math.round(v * 10) / 10 : v;
    }
    db.prepare(`UPDATE community_rules SET ${Object.keys(next).map((k) => `${k} = ?`).join(', ')} WHERE id = 1`).run(...Object.values(next));
    return rules();
  }));

  /** Marks a month's pay as paid, keeping the breakdown as it was. Only once the month is over and every event is scored. */
  api.post('/admin/community/managers/:userId/paid', admin, wrap((req) => {
    const cm = managerRow(Number(req.params.userId));
    if (!cm) throw notFound();
    const month = String(req.body?.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('Pick the month.');
    const s = monthSummary(cm, month);
    if (s.paid) throw new HttpError(409, 'That month is already marked as paid.');
    if (!s.final) throw bad('Wait until the month is over and every event in it is scored.');
    db.prepare('INSERT INTO community_payouts (user_id, month, currency, amount, breakdown) VALUES (?,?,?,?,?)')
      .run(cm.user_id, month, cm.currency, s.total, JSON.stringify({ lines: s.lines, events: s.events.map(({ id, title, starts_at, status, checkins, newcomers, rating, ratings }) => ({ id, title, starts_at, status, checkins, newcomers, rating, ratings })) }));
    if (s.total > 0) notify(cm.user_id, 'ambassador', 'Your pay for {month} is on its way: {amount}.', { month, amount: `${(s.total / 100).toFixed(2)} ${cm.currency}` }, '#/community');
    return monthSummary(cm, month);
  }));

  // The monthly payout sheet: one row per manager.
  api.get('/admin/community.csv', admin, (req, res) => {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : thisMonth();
    const r = rules();
    const amt = (n) => (n / 100).toFixed(2);
    const rows = db.prepare('SELECT * FROM community_managers ORDER BY city').all().map((cm) => {
      const v = managerView(cm), s = monthSummary(cm, month, r), l = s.lines;
      return [v.name, v.email, cm.city, cm.country, cm.currency, l.retainer.held, l.retainer.required, amt(l.retainer.amount), l.events.successful, l.events.paid, amt(l.events.amount),
        l.newcomers.count, amt(l.newcomers.amount), l.family_passes.count, amt(l.family_passes.amount), amt(s.total), s.final ? 'yes' : 'no', s.paid ? s.paid.paid_at : ''];
    });
    res.set('Content-Disposition', `attachment; filename="pairmundo-community-managers-${month}.csv"`).type('text/csv')
      .send([`name,email,city,country,currency,events held,events needed,retainer,successful events,paid events,event pay,newcomers,newcomer pay,family passes,family pass pay,total,final,paid at`,
        ...rows.map((x) => x.map(csvCell).join(','))].join('\n') + '\n');
  });

  return { managerOf, monthSummary, scoreOf };
}
