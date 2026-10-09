import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { json, tx } from './db.js';
import { hashPassword, verifyPassword, createSession, sessionMiddleware, requireAuth, requireRole, rateLimit } from './auth.js';
import { scoreMatch, checkCompliance, ageOn } from './matching.js';
import { PROGRAMS, REVIEW_CRITERIA, PLACEMENT_TASKS } from './programs.js';
import { createMailer, codeEmail, waitlistEmail } from './mailer.js';
import { pickLang, t as translate } from './i18n.js';
import { createCheckout, createIdentity, verifyWebhook } from './identity.js';
import { createRevenueCat, storeName, webhookAuthorized } from './revenuecat.js';
import { createPusher, isPushToken } from './push.js';
import { createStorage } from './storage.js';
import { createModerator } from './moderation.js';
import { createBackups } from './backup.js';
import { createVideo, CALL_HOURS } from './video.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_PHOTOS = 6;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Emails are matched without case or spaces, so "Me@x.com " and "me@x.com" are the same account. */
export const normEmail = (e) => String(e || '').trim().toLowerCase();

const AP_JSON = ['languages', 'preferred_countries', 'age_groups', 'skills', 'traits', 'hobbies', 'certificates'];
const LEVELS = ['native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];
// Picked from fixed lists in the apps, so only short keys are stored.
const KEY_LISTS = ['traits', 'hobbies'];
const FAM_JSON = ['children', 'languages', 'required_languages', 'preferred_nationalities'];
const AP_FIELDS = ['birth_date', 'nationality', 'gender', 'childcare_years', 'drivers_license', 'non_smoker', 'ok_with_pets', 'available_from', 'duration_months', 'education', 'bio', 'video_url', 'visible', 'goal', 'ideal_family', ...AP_JSON];
const FAM_FIELDS = ['start_date', 'duration_months', 'weekly_hours', 'pocket_money', 'needs_driver', 'has_pets', 'smoking_household', 'private_room', 'bio', 'visible', ...FAM_JSON];
const USER_FIELDS = ['name', 'country', 'city'];
// Reviews become visible once both sides have reviewed, or 14 days after the placement ends.
const REVIEW_REVEAL_DAYS = 14;
const CODE_MINUTES = 30;
const CODE_MAX_ATTEMPTS = 5;

/** The Family Pass: what families buy to message au pairs, as 1 or 3 months paid once. */
// amount/currency are the website price (Stripe). product_id is the one-off (consumable) in-app product set up in
// App Store Connect, Google Play and RevenueCat; the stores charge their own listed price.
export const PASS_PLANS = [
  { id: 'month', days: 30, price: '€39', amount: 3900, currency: 'eur', product_id: 'family_pass_30', name: 'PairMundo Family Pass (1 month)' },
  { id: 'quarter', days: 90, price: '€79', amount: 7900, currency: 'eur', product_id: 'family_pass_90', name: 'PairMundo Family Pass (3 months)' },
];
// The 3-month pass is the default, and what app versions from before the 1-month pass show.
export const FAMILY_PASS = PASS_PLANS[1];
const passPlan = (key, value) => PASS_PLANS.find((p) => p[key] === value);
/** What an ambassador earns for people who join with their referral code, in US cents (ambassadors are paid in
 *  dollars, whatever the Family Pass costs). Au pair profile rewards count only once the au pair's ID is verified,
 *  and stop at the monthly cap, because a profile alone is easy to fake. */
export const AMBASSADOR_REWARDS = { currency: 'usd', profile: 200, profile_monthly_cap: 10000, pass: 1500, placement: 4000 };

/** Certificates an au pair adds themselves: one per kind, with a short note such as "IELTS 7.0" or "Red Cross, 2026". */
const cleanCerts = (list) => {
  const seen = new Set();
  return list.filter((c) => c && /^[a-z_]{1,24}$/.test(c.kind) && !seen.has(c.kind) && seen.add(c.kind))
    .slice(0, 10).map((c) => ({ kind: c.kind, detail: str(c.detail, 80) || null }));
};
/** Au pair languages as [{code, level}], with the level on the CEFR scale (or native). */
const cleanLangs = (list) => {
  const seen = new Set();
  return list.filter((l) => l && /^[a-z]{2,3}$/.test(l.code) && !seen.has(l.code) && seen.add(l.code))
    .slice(0, 12).map((l) => ({ code: l.code, level: LEVELS.includes(l.level) ? l.level : 'B2' }));
};

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = 'Not found.') => new HttpError(404, msg);
const forbidden = (msg = 'Not allowed.') => new HttpError(403, msg);

/** node:sqlite only binds numbers, strings, null and buffers. */
const sql = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
// What the apps get for a chat message. A call message says whether its call is still open, never the room address itself.
const MSG_COLS = `id, sender_id, body, created_at, read_at, call_url IS NOT NULL AS is_call,
  (call_url IS NOT NULL AND created_at > datetime('now', '-${CALL_HOURS} hours')) AS call_open`;
const str = (v, max = 5000) => (v == null ? null : String(v).trim().slice(0, max));
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function seedPrograms(db) {
  // Seed rows are refreshed on every start so corrections reach existing databases, unless an admin has edited the row.
  const cols = ['name', 'currency', 'visa', 'min_age', 'max_age', 'max_weekly_hours', 'max_daily_hours', 'min_pocket_money', 'pocket_money_note',
    'min_months', 'max_months', 'agency_required', 'family_obligations', 'notes', 'official_source', 'last_reviewed', 'status', 'status_note', 'eu_eea_only'];
  const ins = db.prepare(`INSERT INTO country_programs (code, ${cols.join(', ')}) VALUES (?${', ?'.repeat(cols.length)})
    ON CONFLICT(code) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')} WHERE admin_edited = 0`);
  for (const p of PROGRAMS) {
    ins.run(p.code, p.name, p.currency, p.visa, p.min_age, p.max_age, p.max_weekly_hours, sql(p.max_daily_hours),
      sql(p.min_pocket_money), p.pocket_money_note, p.min_months, p.max_months, p.agency_required,
      json.str(p.family_obligations), p.notes, p.official_source, '2026-10', p.status || 'open', sql(p.status_note), p.eu_eea_only || 0);
  }
}

export function createApp(db, { mailer = createMailer(), pusher = createPusher(), storage, identity = createIdentity(), checkout = createCheckout(), revenuecat = createRevenueCat(), backups = createBackups(db), moderator = createModerator(), video = createVideo() } = {}) {
  const UPLOAD_DIR = process.env.UPLOAD_DIR || 'data/uploads';
  storage ??= createStorage({ dir: UPLOAD_DIR });
  seedPrograms(db);
  const app = express();
  app.disable('x-powered-by');
  // Behind a hosting proxy (Render, Railway, ...) this makes req.ip the visitor's address, so rate limits apply per person.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) app.set('trust proxy', 1);
  // Stripe signs the exact bytes it sends, so this route reads the raw body before the JSON parser below.
  app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '200kb' }), (req, res) => stripeWebhook(req, res));
  app.use('/api/me/photos', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '200kb' }));
  // The mobile app talks to this API with a Bearer token. Native apps ignore CORS; this lets its web preview work too.
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use('/api', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', corsOrigin);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(sessionMiddleware(db));
  // Remember which language each person's app uses, so their notifications and emails match it.
  app.use((req, res, next) => {
    const lang = req.user && pickLang(req.get('accept-language'));
    if (lang && lang !== req.user.lang) { db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(lang, req.user.id); req.user.lang = lang; }
    next();
  });

  // ---------- helpers ----------
  const getProgram = (code) => {
    const p = db.prepare('SELECT * FROM country_programs WHERE code = ?').get(code ?? '');
    if (p) p.family_obligations = json.parse(p.family_obligations);
    return p;
  };

  const photosOf = (u) => { const ph = json.parse(u.photos); return ph.length ? ph : u.photo_url ? [u.photo_url] : []; };
  const publicUser = (u) => u && ({
    id: u.id, role: u.role, name: u.name, country: u.country, city: u.city, photo_url: photosOf(u)[0] || null, photos: photosOf(u),
    verification: { id: !!u.id_verified, references: !!u.references_checked, background: !!u.background_checked },
    member_since: u.created_at, last_active_at: u.last_active_at,
  });

  const getProfile = (user) => {
    if (user.role === 'aupair') {
      const p = db.prepare('SELECT * FROM aupair_profiles WHERE user_id = ?').get(user.id);
      if (!p) return null;
      for (const k of AP_JSON) p[k] = json.parse(p[k]);
      p.age = ageOn(p.birth_date);
      return p;
    }
    if (user.role === 'family') {
      const p = db.prepare('SELECT * FROM family_profiles WHERE user_id = ?').get(user.id);
      if (!p) return null;
      for (const k of FAM_JSON) p[k] = json.parse(p[k]);
      return p;
    }
    return null;
  };

  const visibleReviewsSql = `r.hidden = 0 AND (
      EXISTS (SELECT 1 FROM reviews r2 WHERE r2.placement_id = r.placement_id AND r2.reviewer_id = r.reviewee_id)
      OR date(p.end_date, '+${REVIEW_REVEAL_DAYS} days') <= date('now'))`;

  const ratingSummary = (userId) => {
    const rows = db.prepare(`SELECT r.overall, r.criteria FROM reviews r JOIN placements p ON p.id = r.placement_id
                             WHERE r.reviewee_id = ? AND ${visibleReviewsSql}`).all(userId);
    if (!rows.length) return { avg: null, count: 0, criteria: {} };
    const crit = {};
    for (const r of rows) {
      for (const [k, v] of Object.entries(json.parse(r.criteria, {}))) {
        (crit[k] ||= []).push(v);
      }
    }
    const avg = (a) => Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10;
    return {
      avg: avg(rows.map((r) => r.overall)),
      count: rows.length,
      criteria: Object.fromEntries(Object.entries(crit).map(([k, v]) => [k, avg(v)])),
    };
  };

  /** Sends a push notification to every phone the user is signed in on. Never blocks or fails the request. */
  const push = (userId, body, link = null, title = 'PairMundo') => {
    const tokens = db.prepare('SELECT token FROM push_tokens WHERE user_id = ?').all(userId).map((r) => r.token);
    if (!tokens.length) return;
    const messages = tokens.map((to) => ({ to, title, body, sound: 'default', data: { link } }));
    Promise.resolve().then(() => pusher(messages)).then((tickets) => {
      // Forget phones that uninstalled the app or turned notifications off.
      (tickets || []).forEach((t, i) => {
        if (t?.details?.error === 'DeviceNotRegistered') db.prepare('DELETE FROM push_tokens WHERE token = ?').run(tokens[i]);
      });
    }).catch((e) => console.error('Push failed:', e.message));
  };
  /** Tell someone about something, in their language. text is English with {placeholders} filled from vars. */
  const notify = (userId, kind, english, vars, link = null) => {
    const text = translate(db.prepare('SELECT lang FROM users WHERE id = ?').get(userId)?.lang, english, vars);
    db.prepare('INSERT INTO notifications (user_id, kind, text, link) VALUES (?,?,?,?)').run(userId, kind, text, link);
    push(userId, text, link);
  };

  const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));

  const acceptedRequestBetween = (a, b) => db.prepare(`SELECT id FROM match_requests WHERE status = 'accepted'
      AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))`).get(a, b, b, a);

  const conversationFor = (a, b, create = false) => {
    const [x, y] = a < b ? [a, b] : [b, a];
    let c = db.prepare('SELECT * FROM conversations WHERE user_a = ? AND user_b = ?').get(x, y);
    if (!c && create) {
      db.prepare('INSERT INTO conversations (user_a, user_b) VALUES (?, ?)').run(x, y);
      c = db.prepare('SELECT * FROM conversations WHERE user_a = ? AND user_b = ?').get(x, y);
    }
    return c;
  };

  /** Accept a pending request: opens the conversation and carries the intro message into it. */
  const acceptRequest = (r) => tx(db, () => {
    db.prepare("UPDATE match_requests SET status = 'accepted', responded_at = datetime('now') WHERE id = ?").run(r.id);
    const c = conversationFor(r.from_user, r.to_user, true);
    if (r.message) db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?,?,?,?)')
      .run(c.id, r.from_user, r.message, r.created_at);
    return c;
  });

  // ---------- blocking ----------
  /** SQL condition: neither side has blocked the other. Bind the viewer's id twice. */
  const notBlocked = (col) => `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.user_id = ? AND b.target_id = ${col}) OR (b.target_id = ? AND b.user_id = ${col}))`;
  const blockedBetween = (a, b) => !!db.prepare('SELECT 1 FROM blocks WHERE (user_id = ? AND target_id = ?) OR (user_id = ? AND target_id = ?)').get(a, b, b, a);

  // ---------- email codes ----------
  const hashCode = (code) => createHash('sha256').update(String(code)).digest('hex');
  const issueCode = (user, purpose) => {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const expires = new Date(Date.now() + CODE_MINUTES * 60000).toISOString();
    db.prepare(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at, attempts) VALUES (?,?,?,?,0)
      ON CONFLICT(user_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`)
      .run(user.id, purpose, hashCode(code), expires);
    Promise.resolve(mailer({ to: user.email, ...codeEmail(purpose, code, user.lang) })).catch((e) => console.error('Email failed:', e.message));
  };
  /** Checks a code and uses it up. Wrong guesses count; after a few the code stops working. */
  const useCode = (userId, purpose, code) => {
    const row = db.prepare('SELECT * FROM email_codes WHERE user_id = ? AND purpose = ?').get(userId, purpose);
    if (!row || row.expires_at < new Date().toISOString()) throw bad('That code has expired. Ask for a new one.');
    if (row.attempts >= CODE_MAX_ATTEMPTS) throw bad('Too many wrong tries. Ask for a new code.');
    const ok = timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hashCode(String(code || '').trim()), 'hex'));
    if (!ok) {
      db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ? AND purpose = ?').run(userId, purpose);
      throw bad('That code is not right. Check the email and try again.');
    }
    db.prepare('DELETE FROM email_codes WHERE user_id = ? AND purpose = ?').run(userId, purpose);
  };
  /** Liking, messaging and proposing placements need a confirmed email. */
  const mustBeVerified = (user) => {
    if (user.role !== 'admin' && !user.email_verified) throw new HttpError(403, 'Confirm your email first. We sent you a 6-digit code.', 'email_unverified');
  };

  const wrap = (fn) => (req, res, next) => {
    try {
      const out = fn(req, res);
      const send = (v) => { if (v !== undefined && !res.headersSent) res.json(v); };
      if (typeof out?.then === 'function') out.then(send, next); else send(out);
    } catch (e) { next(e); }
  };

  const api = express.Router();

  const authLimit = rateLimit({ windowMs: 60000, max: Number(process.env.AUTH_RATE_LIMIT || 30) });

  // ---------- ambassadors ----------
  // Ambassadors share a link (pairmundo.com/?ref=CODE) or a code people type at sign-up. Rewards are recorded as they
  // happen, so the monthly payout is just a sum, and paying out marks them paid.
  const referralCode = (v) => { const c = String(v ?? '').trim().toUpperCase(); return /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(c) ? c : null; };
  const ambassadorByCode = (code) => (code ? db.prepare('SELECT * FROM ambassadors WHERE code = ? AND active = 1').get(code) : undefined);
  const referralLink = (a) => `${publicBase()}/?ref=${encodeURIComponent(a.code)}`;
  const monthParam = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v || '') ? v : null);
  /** Records a reward for whoever referred userId. Each person earns their ambassador each kind of reward once. */
  const addReward = (userId, kind, amount, note = null) => {
    const u = getUser(userId);
    const a = u?.ref_code ? db.prepare('SELECT * FROM ambassadors WHERE code = ?').get(u.ref_code) : null;
    if (!a?.active || a.user_id === u.id || u.suspended) return;
    if (kind === 'profile') {
      const used = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) n FROM referral_rewards WHERE ambassador_id = ? AND kind = 'profile' AND created_at >= datetime('now', 'start of month')").get(a.id).n;
      amount = Math.max(0, Math.min(amount, AMBASSADOR_REWARDS.profile_monthly_cap - used));
    }
    db.prepare('INSERT OR IGNORE INTO referral_rewards (ambassador_id, user_id, kind, amount_cents, note) VALUES (?,?,?,?,?)').run(a.id, u.id, kind, Math.round(amount), note);
  };
  /** An au pair's profile counts once it has what families look at (a photo, about me, nationality, age, languages and
   *  dates) and their ID is verified. */
  const checkProfileReward = (userId) => {
    const u = getUser(userId);
    if (u?.role !== 'aupair' || !u.ref_code || !u.email_verified || !u.id_verified) return;
    const p = db.prepare('SELECT * FROM aupair_profiles WHERE user_id = ?').get(u.id);
    if (photosOf(u).length && p?.bio && p.nationality && p.birth_date && json.parse(p.languages).length && p.available_from) {
      addReward(u.id, 'profile', AMBASSADOR_REWARDS.profile, 'Au pair profile complete');
    }
  };
  /** What an ambassador's code brought in, for one month (YYYY-MM) or all time. owed_cents is everything not paid yet. */
  const ambassadorStats = (a, month = null) => {
    const when = month ? " AND strftime('%Y-%m', created_at) = ?" : '';
    const m = month ? [month] : [];
    const people = db.prepare(`SELECT SUM(role = 'aupair') aupairs, SUM(role = 'family') families FROM users WHERE ref_code = ? AND id IS NOT ?${when}`).get(a.code, a.user_id, ...m);
    const r = db.prepare(`SELECT SUM(kind = 'profile') profiles, SUM(kind = 'pass') passes, SUM(kind = 'placement') placements,
      COALESCE(SUM(amount_cents), 0) earned_cents FROM referral_rewards WHERE ambassador_id = ?${when}`).get(a.id, ...m);
    return {
      waitlist: db.prepare(`SELECT COUNT(*) n FROM waitlist WHERE ref_code = ?${when}`).get(a.code, ...m).n,
      aupairs: people.aupairs || 0, families: people.families || 0,
      profiles: r.profiles || 0, passes: r.passes || 0, placements: r.placements || 0, earned_cents: r.earned_cents,
      owed_cents: db.prepare('SELECT COALESCE(SUM(amount_cents), 0) n FROM referral_rewards WHERE ambassador_id = ? AND paid_at IS NULL').get(a.id).n,
    };
  };
  const adminAmbassador = (id, month = null, detail = true) => {
    const a = db.prepare('SELECT a.*, u.email account_email FROM ambassadors a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?').get(Number(id));
    if (!a) throw notFound();
    return {
      ...a, active: !!a.active, link: referralLink(a), stats: ambassadorStats(a, month),
      ...(detail ? {
        referrals: db.prepare('SELECT id, name, role, country, created_at, suspended FROM users WHERE ref_code = ? ORDER BY created_at DESC, id DESC LIMIT 500').all(a.code),
        rewards: db.prepare('SELECT r.*, u.name user_name FROM referral_rewards r LEFT JOIN users u ON u.id = r.user_id WHERE r.ambassador_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 500').all(a.id),
      } : {}),
    };
  };

  // The website and app show who invited someone, so they can tell the code is right.
  api.get('/referral/:code', authLimit, wrap((req) => {
    const a = ambassadorByCode(referralCode(req.params.code));
    if (!a) throw notFound('That referral code is not valid. Check it, or leave it empty.');
    return { code: a.code, name: a.name.split(/\s+/)[0] };
  }));

  // ---------- auth ----------

  // ---------- waitlist ----------
  // Anyone can ask to hear when the apps launch. Joining twice changes nothing, and the answer is the same either
  // way, so the form can't be used to find out who is on the list.
  api.post('/waitlist', authLimit, wrap(async (req) => {
    const email = normEmail(req.body?.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw bad('Enter a valid email.');
    const role = ['aupair', 'family'].includes(req.body?.role) ? req.body.role : null;
    const country = /^[A-Za-z]{2}$/.test(req.body?.country || '') ? req.body.country.toUpperCase() : null;
    const lang = pickLang(req.get('accept-language')) || 'en';
    // Flyers and ads link to pairmundo.com/?src=<name>, so the admin can see which ones bring people in.
    const source = /^[a-z0-9][a-z0-9-]{0,39}$/i.test(req.body?.source || '') ? req.body.source.toLowerCase() : null;
    const refCode = ambassadorByCode(referralCode(req.body?.ref_code))?.code ?? null;
    const token = randomBytes(18).toString('base64url');
    const added = db.prepare('INSERT OR IGNORE INTO waitlist (email, role, country, lang, source, ref_code, token) VALUES (?,?,?,?,?,?,?)').run(email, role, country, lang, source, refCode, token).changes;
    if (added) {
      const { subject, text } = waitlistEmail(lang, `${publicBase()}/api/waitlist/leave?t=${token}`);
      try { await mailer({ to: email, subject, text }); } catch (e) { console.error('Waitlist email failed:', e.message); }
    }
    return { ok: true };
  }));
  api.get('/waitlist/leave', wrap((req, res) => {
    const gone = db.prepare('DELETE FROM waitlist WHERE token = ?').run(String(req.query.t || '')).changes;
    const lang = pickLang(req.get('accept-language')) || 'en';
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/legal.css"><main><h1>PairMundo</h1><p>${
      translate(lang, gone ? "You're off the list. We won't email you about the launch." : 'This link was already used, or the address is not on the list.')}</p><p><a href="/">pairmundo.com</a></p></main>`);
  }));

  api.post('/auth/register', authLimit, wrap((req, res) => {
    const { password, role, name, country, city } = req.body || {};
    const email = normEmail(req.body?.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email.');
    if (!password || String(password).length < 8) throw bad('Password must be at least 8 characters.');
    if (!['aupair', 'family'].includes(role)) throw bad('Choose au pair or host family.');
    if (!str(name)) throw bad('Name is required.');
    // An ambassador's referral code, typed in or carried over from their link.
    let ambassador = str(req.body?.ref_code) ? ambassadorByCode(referralCode(req.body.ref_code)) : null;
    if (str(req.body?.ref_code) && !ambassador) throw bad('That referral code is not valid. Check it, or leave it empty.');
    // Someone who joined the waitlist from an ambassador's link or a flyer and signs up later in the app keeps
    // that ambassador and source, so a referral made before launch still counts.
    const waited = db.prepare('SELECT source, ref_code FROM waitlist WHERE email = ?').get(email);
    ambassador ??= ambassadorByCode(waited?.ref_code);
    const source = str(req.body?.source, 60)?.toLowerCase() ?? waited?.source ?? null;
    if (db.prepare('SELECT 1 FROM users WHERE lower(trim(email)) = ?').get(email)) throw new HttpError(409, 'An account with this email already exists.');
    const user = tx(db, () => {
      const r = db.prepare('INSERT INTO users (email, password_hash, role, name, country, city, lang, source, ref_code) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(email, hashPassword(String(password)), role, str(name, 120), str(country, 2)?.toUpperCase() ?? null, str(city, 120), pickLang(req.get('accept-language')),
          source, ambassador?.code ?? null);
      const id = Number(r.lastInsertRowid);
      db.prepare(`INSERT INTO ${role === 'aupair' ? 'aupair_profiles' : 'family_profiles'} (user_id) VALUES (?)`).run(id);
      return getUser(id);
    });
    // New families can get a free trial of the Family Pass (FAMILY_TRIAL_DAYS, off unless set).
    if (role === 'family' && trialDays()) grantPass(user.id, 'trial', `signup-${user.id}`, trialDays(), { quiet: true });
    issueCode(user, 'verify');
    const s = createSession(db, user.id);
    setCookie(res, s.token);
    res.status(201);
    return { user: { ...publicUser(user), email: user.email, email_verified: false }, token: s.token };
  }));

  api.post('/auth/login', authLimit, wrap((req, res) => {
    const { email, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE lower(trim(email)) = ?').get(normEmail(email));
    if (!user || !verifyPassword(String(password || ''), user.password_hash)) throw new HttpError(401, 'Wrong email or password.');
    if (user.suspended) throw forbidden('This account is suspended. Contact support.');
    const s = createSession(db, user.id);
    setCookie(res, s.token);
    return { user: { ...publicUser(user), email: user.email, email_verified: !!user.email_verified }, token: s.token };
  }));

  api.post('/auth/verify-email', requireAuth, authLimit, wrap((req) => {
    if (req.user.email_verified) return { ok: true };
    useCode(req.user.id, 'verify', req.body?.code);
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(req.user.id);
    checkProfileReward(req.user.id);
    return { ok: true };
  }));

  api.post('/auth/resend-verification', requireAuth, authLimit, wrap((req) => {
    if (!req.user.email_verified) issueCode(req.user, 'verify');
    return { ok: true };
  }));

  // Always answers the same way, so nobody can use it to find out which emails have accounts.
  api.post('/auth/forgot', authLimit, wrap((req) => {
    const user = db.prepare('SELECT * FROM users WHERE lower(trim(email)) = ?').get(normEmail(req.body?.email));
    if (user && !user.suspended) issueCode(user, 'reset');
    return { ok: true };
  }));

  api.post('/auth/reset', authLimit, wrap((req, res) => {
    const { email, code, password } = req.body || {};
    if (!password || String(password).length < 8) throw bad('Password must be at least 8 characters.');
    const user = db.prepare('SELECT * FROM users WHERE lower(trim(email)) = ?').get(normEmail(email));
    if (!user || user.suspended) throw bad('That code has expired. Ask for a new one.');
    useCode(user.id, 'reset', code);
    tx(db, () => {
      // Getting the code by email also proves the address.
      db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(hashPassword(String(password)), user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    });
    const s = createSession(db, user.id);
    setCookie(res, s.token);
    return { user: { ...publicUser(user), email: user.email, email_verified: true }, token: s.token };
  }));

  api.post('/auth/logout', wrap((req, res) => {
    // The app sends its push token so this phone stops getting notifications for the account.
    if (req.user && isPushToken(req.body?.push_token)) db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(req.body.push_token, req.user.id);
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
    res.set('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  // ---------- me / profile ----------
  api.get('/me', requireAuth, wrap((req) => {
    const u = req.user;
    return {
      user: { ...publicUser(u), email: u.email, email_verified: !!u.email_verified },
      profile: getProfile(u),
      pass: passView(u),
      rating: ratingSummary(u.id),
      ambassador: db.prepare('SELECT code FROM ambassadors WHERE user_id = ? AND active = 1').get(u.id) ?? null,
      counts: {
        notifications: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0').get(u.id).n,
        requests: db.prepare("SELECT COUNT(*) n FROM match_requests WHERE to_user = ? AND status = 'pending'").get(u.id).n,
        messages: db.prepare(`SELECT COUNT(*) n FROM messages m JOIN conversations c ON c.id = m.conversation_id
                   WHERE (c.user_a = ? OR c.user_b = ?) AND m.sender_id != ? AND m.read_at IS NULL`).get(u.id, u.id, u.id).n,
      },
    };
  }));

  api.put('/me', requireAuth, wrap((req) => {
    const body = req.body || {};
    const u = req.user;
    tx(db, () => {
      const userSets = USER_FIELDS.filter((k) => k in body);
      if (userSets.length) {
        const vals = userSets.map((k) => (k === 'country' ? str(body[k], 2)?.toUpperCase() : str(body[k], 300)));
        if (userSets.includes('name') && !vals[userSets.indexOf('name')]) throw bad('Name is required.');
        db.prepare(`UPDATE users SET ${userSets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...vals, u.id);
      }
      const p = body.profile || {};
      const [table, fields, jsonFields] = u.role === 'aupair' ? ['aupair_profiles', AP_FIELDS, AP_JSON]
        : u.role === 'family' ? ['family_profiles', FAM_FIELDS, FAM_JSON] : [null, [], []];
      if (!table) return;
      const sets = fields.filter((k) => k in p);
      for (const k of ['birth_date', 'available_from', 'start_date']) {
        if (k in p && p[k] && !isDate(p[k])) throw bad(`${k} must be YYYY-MM-DD.`);
      }
      if (sets.length) {
        const list = (k) => (Array.isArray(p[k]) ? p[k] : []);
        const vals = sets.map((k) => (KEY_LISTS.includes(k) ? json.str([...new Set(list(k).filter((v) => /^[a-z_]{1,24}$/.test(v)))].slice(0, 12))
          : k === 'certificates' ? json.str(cleanCerts(list(k)))
          : k === 'languages' && u.role === 'aupair' ? json.str(cleanLangs(list(k)))
          : jsonFields.includes(k) ? json.str(list(k))
          : ['goal', 'ideal_family'].includes(k) ? str(p[k], 400)
          : typeof p[k] === 'string' ? str(p[k]) : sql(p[k])));
        db.prepare(`UPDATE ${table} SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...vals, u.id);
      }
    });
    checkProfileReward(u.id);
    const fresh = getUser(u.id);
    return { user: publicUser(fresh), profile: getProfile(fresh) };
  }));

  // Deletes the account and everything tied to it. Placements and reviews with the other person go too.
  api.delete('/me', requireAuth, wrap((req, res) => {
    const u = req.user;
    if (u.role === 'admin') throw forbidden('Admin accounts cannot be deleted here.');
    if (!verifyPassword(String(req.body?.password || ''), u.password_hash)) throw new HttpError(401, 'Wrong password.');
    const photos = photosOf(u).filter(storage.owns);
    tx(db, () => {
      const mine = 'SELECT id FROM placements WHERE aupair_id = ? OR family_id = ?';
      const reviews = `SELECT id FROM reviews WHERE reviewer_id = ? OR reviewee_id = ? OR placement_id IN (${mine})`;
      db.prepare(`DELETE FROM reports WHERE reporter_id = ? OR target_user_id = ? OR review_id IN (${reviews})`).run(u.id, u.id, u.id, u.id, u.id, u.id);
      db.prepare(`DELETE FROM reviews WHERE id IN (${reviews})`).run(u.id, u.id, u.id, u.id);
      db.prepare('DELETE FROM placements WHERE aupair_id = ? OR family_id = ? OR created_by = ?').run(u.id, u.id, u.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    });
    for (const p of photos) storage.remove(p);
    res.set('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  // ---------- public profiles ----------
  api.get('/users/:id', requireAuth, wrap((req) => {
    const u = getUser(req.params.id);
    if (!u || u.role === 'admin' || (u.suspended && req.user.role !== 'admin')) throw notFound('Profile not found.');
    const iBlocked = !!db.prepare('SELECT 1 FROM blocks WHERE user_id = ? AND target_id = ?').get(req.user.id, u.id);
    if (!iBlocked && blockedBetween(req.user.id, u.id)) throw notFound('Profile not found.');
    const reviews = db.prepare(`SELECT r.id, r.overall, r.criteria, r.comment, r.response, r.created_at,
          p.start_date, p.end_date, p.country, ru.id reviewer_id, ru.name reviewer_name, ru.role reviewer_role
        FROM reviews r JOIN placements p ON p.id = r.placement_id JOIN users ru ON ru.id = r.reviewer_id
        WHERE r.reviewee_id = ? AND ${visibleReviewsSql} ORDER BY r.created_at DESC`).all(u.id)
      .map((r) => ({ ...r, criteria: json.parse(r.criteria, {}) }));
    const me = req.user;
    let match = null;
    if (me.role !== u.role && me.role !== 'admin') {
      const [ap, fam] = me.role === 'aupair' ? [me, u] : [u, me];
      match = scoreMatch({ user: ap, profile: getProfile(ap) }, { user: fam, profile: getProfile(fam) }, getProgram(fam.country), ratingSummary(ap.id), req.user.lang);
    }
    const req_ = db.prepare(`SELECT id, from_user, status FROM match_requests WHERE
        ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)) ORDER BY id DESC LIMIT 1`).get(me.id, u.id, u.id, me.id);
    return {
      user: publicUser(u),
      profile: getProfile(u),
      rating: ratingSummary(u.id),
      reviews,
      placements_completed: db.prepare(`SELECT COUNT(*) n FROM placements WHERE status = 'completed' AND (aupair_id = ? OR family_id = ?)`).get(u.id, u.id).n,
      match,
      // Who liked you is part of the Family Pass.
      request: req_ && !(req_.status === 'pending' && req_.from_user === u.id && needsPass(me)) ? req_ : null,
      favorite: !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND target_id = ?').get(me.id, u.id),
      blocked: iBlocked,
    };
  }));

  api.post('/users/:id/block', requireAuth, wrap((req) => {
    const t = getUser(req.params.id);
    if (!t || t.id === req.user.id || t.role === 'admin') throw notFound();
    const me = req.user.id;
    tx(db, () => {
      db.prepare('INSERT OR IGNORE INTO blocks (user_id, target_id) VALUES (?, ?)').run(me, t.id);
      db.prepare(`UPDATE match_requests SET status = 'declined', responded_at = datetime('now') WHERE status = 'pending'
          AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))`).run(me, t.id, t.id, me);
      const c = conversationFor(me, t.id);
      if (c) db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id = ? AND read_at IS NULL").run(c.id, t.id);
      const reason = str(req.body?.reason, 2000);
      if (reason) db.prepare('INSERT INTO reports (reporter_id, target_user_id, reason) VALUES (?,?,?)').run(me, t.id, reason);
    });
    return { ok: true };
  }));

  api.delete('/users/:id/block', requireAuth, wrap((req) => {
    db.prepare('DELETE FROM blocks WHERE user_id = ? AND target_id = ?').run(req.user.id, Number(req.params.id));
    return { ok: true };
  }));

  api.get('/blocks', requireAuth, wrap((req) => ({
    blocked: db.prepare('SELECT u.* FROM blocks b JOIN users u ON u.id = b.target_id WHERE b.user_id = ? ORDER BY b.created_at DESC')
      .all(req.user.id).map(publicUser),
  })));

  // ---------- search & matching ----------
  const findCandidates = (me, q, discover = false) => {
    const myProfile = getProfile(me);
    const lockLikes = needsPass(me);
    const targetRole = me.role === 'family' ? 'aupair' : 'family';
    const table = targetRole === 'aupair' ? 'aupair_profiles' : 'family_profiles';
    const where = ['u.role = ?', 'u.suspended = 0', 'p.visible = 1', notBlocked('u.id')];
    const params = [targetRole, me.id, me.id];
    if (q.country) { where.push('u.country = ?'); params.push(String(q.country).toUpperCase()); }
    if (q.nationality && targetRole === 'aupair') { where.push('p.nationality = ?'); params.push(String(q.nationality).toUpperCase()); }
    if (q.verified === '1') where.push('u.id_verified = 1');
    if (q.driver === '1' && targetRole === 'aupair') where.push('p.drivers_license = 1');
    if (q.cpr === '1' && targetRole === 'aupair') where.push("EXISTS (SELECT 1 FROM json_each(p.certificates) WHERE json_extract(value, '$.kind') IN ('cpr', 'first_aid'))");
    if (discover) {
      // Hide anyone already swiped on, liked, or matched with; keep people who liked me so I can like them back.
      where.push(`u.id NOT IN (SELECT target_id FROM swipes WHERE user_id = ?)`, `u.id NOT IN (SELECT to_user FROM match_requests WHERE from_user = ? AND status IN ('pending','accepted'))`,
        `u.id NOT IN (SELECT from_user FROM match_requests WHERE to_user = ? AND status = 'accepted')`);
      params.push(me.id, me.id, me.id);
    }
    if (q.q) { where.push('(u.name LIKE ? OR p.bio LIKE ? OR u.city LIKE ?)'); const like = `%${q.q}%`; params.push(like, like, like); }
    const rows = db.prepare(`SELECT u.* FROM users u JOIN ${table} p ON p.user_id = u.id WHERE ${where.join(' AND ')}`).all(...params);

    let results = rows.map((u) => {
      const profile = getProfile(u);
      const rating = ratingSummary(u.id);
      const [ap, fam] = me.role === 'aupair'
        ? [{ user: me, profile: myProfile }, { user: u, profile }]
        : [{ user: u, profile }, { user: me, profile: myProfile }];
      const match = scoreMatch(ap, fam, getProgram(fam.user.country), ratingSummary(ap.user.id), me.lang);
      const likesYou = !!db.prepare("SELECT 1 FROM match_requests WHERE from_user = ? AND to_user = ? AND status = 'pending'").get(u.id, me.id);
      return { user: publicUser(u), profile, rating, match, likes_you: likesYou && !lockLikes };
    });

    if (q.language) {
      const lang = String(q.language).toLowerCase();
      results = results.filter((r) => targetRole === 'aupair'
        ? r.profile.languages.some((l) => l.code === lang)
        : r.profile.languages.includes(lang) || r.profile.required_languages.includes(lang));
    }
    if (q.min_rating) results = results.filter((r) => (r.rating.avg ?? 0) >= Number(q.min_rating));
    if (q.min_age && targetRole === 'aupair') results = results.filter((r) => r.profile.age != null && r.profile.age >= Number(q.min_age));
    if (q.max_age && targetRole === 'aupair') results = results.filter((r) => r.profile.age != null && r.profile.age <= Number(q.max_age));
    if (q.available_by && targetRole === 'aupair') results = results.filter((r) => !r.profile.available_from || r.profile.available_from <= q.available_by);

    const sort = q.sort || 'match';
    const byNum = (f) => (a, b) => (f(b) ?? -1) - (f(a) ?? -1);
    results.sort(sort === 'rating' ? byNum((r) => r.rating.avg)
      : sort === 'recent' ? (a, b) => String(b.user.last_active_at).localeCompare(String(a.user.last_active_at))
        : byNum((r) => r.match.score));
    const limit = Math.min(Number(q.limit) || 50, 100);
    return { total: results.length, results: results.slice(0, limit) };
  };

  api.get('/search', requireRole('aupair', 'family'), wrap((req) => findCandidates(req.user, req.query)));
  api.get('/discover', requireRole('aupair', 'family'), wrap((req) => findCandidates(req.user, { ...req.query, limit: req.query.limit || 20 }, true)));

  // ---------- swiping ----------
  api.post('/swipe', requireRole('aupair', 'family'), wrap((req) => {
    const me = req.user;
    const { target_id, direction, message } = req.body || {};
    if (!['like', 'pass', 'super'].includes(direction)) throw bad('Swipe left (pass), right (like) or up (super like).');
    const t = getUser(target_id);
    if (!t || t.suspended || t.role === me.role || t.role === 'admin') throw bad('You can only swipe on the other side (au pair ↔ host family).');
    if (blockedBetween(me.id, t.id)) throw notFound('Profile not found.');
    if (direction !== 'pass') mustBeVerified(me);
    db.prepare('INSERT OR REPLACE INTO swipes (user_id, target_id, direction) VALUES (?,?,?)').run(me.id, t.id, direction);
    const theirs = db.prepare("SELECT * FROM match_requests WHERE from_user = ? AND to_user = ? AND status = 'pending'").get(t.id, me.id);
    if (direction === 'pass') {
      if (theirs) db.prepare("UPDATE match_requests SET status = 'declined', responded_at = datetime('now') WHERE id = ?").run(theirs.id);
      return { matched: false };
    }
    if (theirs) {
      const c = acceptRequest(theirs);
      notify(t.id, 'match', "It's a match! {name} liked you back.", { name: me.name }, `#/messages/${c.id}`);
      return { matched: true, conversation_id: c.id, other: publicUser(t) };
    }
    const mine = db.prepare("SELECT id FROM match_requests WHERE from_user = ? AND to_user = ? AND status IN ('pending','accepted')").get(me.id, t.id);
    if (!mine) {
      db.prepare('INSERT INTO match_requests (from_user, to_user, message) VALUES (?, ?, ?)').run(me.id, t.id, str(message, 2000));
      notify(t.id, 'like', direction === 'super' ? '{name} super liked you! ⭐' : 'Someone new liked you. See who in Likes.', { name: me.name }, '#/likes');
    }
    return { matched: false };
  }));

  api.post('/swipe/undo', requireRole('aupair', 'family'), wrap((req) => {
    const me = req.user;
    const last = db.prepare('SELECT * FROM swipes WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(me.id);
    if (!last) throw bad('Nothing to undo.');
    if (db.prepare("SELECT 1 FROM match_requests WHERE status = 'accepted' AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))").get(me.id, last.target_id, last.target_id, me.id)) {
      throw bad('You already matched with them, so this swipe can\'t be undone.');
    }
    tx(db, () => {
      db.prepare('DELETE FROM swipes WHERE user_id = ? AND target_id = ?').run(me.id, last.target_id);
      db.prepare("DELETE FROM match_requests WHERE from_user = ? AND to_user = ? AND status = 'pending'").run(me.id, last.target_id);
      // A pass on someone who liked me declined their like; restore it.
      db.prepare("UPDATE match_requests SET status = 'pending', responded_at = NULL WHERE from_user = ? AND to_user = ? AND status = 'declined'").run(last.target_id, me.id);
    });
    const t = getUser(last.target_id);
    return { user: publicUser(t) };
  }));

  api.delete('/swipes/passes', requireRole('aupair', 'family'), wrap((req) => {
    const r = db.prepare("DELETE FROM swipes WHERE user_id = ? AND direction = 'pass'").run(req.user.id);
    return { cleared: r.changes };
  }));

  api.get('/likes', requireRole('aupair', 'family'), wrap((req) => {
    const me = req.user;
    const rows = db.prepare(`SELECT r.id request_id, r.message, r.created_at, u.* FROM match_requests r JOIN users u ON u.id = r.from_user
        WHERE r.to_user = ? AND r.status = 'pending' AND u.suspended = 0 AND ${notBlocked('u.id')} ORDER BY r.created_at DESC`).all(me.id, me.id, me.id);
    // Without the Family Pass, a family sees how many people liked them, but not who.
    if (needsPass(me)) return { likes: [], locked: true, count: rows.length };
    const myProfile = getProfile(me);
    return {
      likes: rows.map((u) => {
        const profile = getProfile(u);
        const [ap, fam] = me.role === 'aupair' ? [{ user: me, profile: myProfile }, { user: u, profile }] : [{ user: u, profile }, { user: me, profile: myProfile }];
        const sw = db.prepare('SELECT direction FROM swipes WHERE user_id = ? AND target_id = ?').get(u.id, me.id);
        return { request_id: u.request_id, message: u.message, created_at: u.created_at, super: sw?.direction === 'super',
          user: publicUser(u), profile, rating: ratingSummary(u.id), match: scoreMatch(ap, fam, getProgram(fam.user.country), ratingSummary(ap.user.id), req.user.lang) };
      }),
    };
  }));

  // ---------- push notifications ----------
  // Family Pass: families pay to message au pairs and to see who liked them; au pairs are always free.
  // It only applies with FAMILY_PASS=on, so nobody is locked out before payments are set up.
  const passRequired = () => process.env.FAMILY_PASS === 'on';
  const trialDays = () => { const n = Math.floor(Number(process.env.FAMILY_TRIAL_DAYS)); return n > 0 && n <= 90 ? n : 0; };
  const activePass = (userId) => db.prepare("SELECT * FROM passes WHERE user_id = ? AND ends_at > datetime('now') ORDER BY ends_at DESC LIMIT 1").get(userId);
  const needsPass = (u) => passRequired() && u.role === 'family' && !activePass(u.id);
  const passView = (u) => {
    const p = activePass(u.id);
    return { required: passRequired() && u.role === 'family', active: !!p, trial: p?.source === 'trial', ends_at: p?.ends_at ?? null, days: FAMILY_PASS.days, price: FAMILY_PASS.price, web_checkout: !!checkout, product_id: FAMILY_PASS.product_id,
      plans: PASS_PLANS.map(({ id, days, price, product_id }) => ({ id, days, price, product_id })) };
  };
  /** Adds a pass, starting when the current one ends. A purchase already counted (same source and ref) is ignored. */
  const grantPass = (userId, source, ref = null, days = FAMILY_PASS.days, { quiet = false } = {}) => {
    if (ref && db.prepare('SELECT 1 FROM passes WHERE source = ? AND ref = ?').get(source, ref)) return false;
    const start = activePass(userId)?.ends_at ?? db.prepare("SELECT datetime('now') d").get().d;
    db.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?,?,?,?, datetime(?, ?))").run(userId, source, ref, start, start, `+${Number(days)} days`);
    // A family's first paid pass earns their ambassador a reward. Trials and free days from an admin don't count.
    const plan = !['trial', 'admin'].includes(source) && passPlan('days', Number(days));
    if (plan) addReward(userId, 'pass', AMBASSADOR_REWARDS.pass, `First Family Pass (${plan.price})`);
    if (!quiet) notify(userId, 'pass', 'Your Family Pass is active. You can now message au pairs and see who liked you.', {}, '#/likes');
    return true;
  };
  const mustHavePass = (u) => {
    if (needsPass(u)) throw new HttpError(402, 'Get the Family Pass to message au pairs.', 'pass_required');
  };
  api.get('/family-pass', requireAuth, wrap((req) => passView(req.user)));
  const publicBase = () => (process.env.PUBLIC_URL || 'https://pairmundo.com').replace(/\/$/, '');
  // Paying on the website goes through Stripe Checkout. The webhook grants the pass; the page also checks on return.
  api.post('/family-pass/checkout', requireAuth, wrap(async (req) => {
    if (!checkout) throw new HttpError(503, 'Payments are coming soon.');
    if (req.user.role !== 'family') throw forbidden('Only families need the Family Pass.');
    const plan = passPlan('id', req.body?.plan) || FAMILY_PASS;
    const s = await checkout.start(req.user, {
      amount: plan.amount, currency: plan.currency, name: plan.name, plan: plan.id,
      successUrl: `${publicBase()}/#/family-pass?paid={CHECKOUT_SESSION_ID}`, cancelUrl: `${publicBase()}/#/family-pass`,
    });
    return { url: s.url };
  }));
  api.post('/family-pass/checkout/:id', requireAuth, wrap(async (req) => {
    if (!checkout) throw new HttpError(503, 'Payments are coming soon.');
    let r;
    try { r = await checkout.result(req.params.id); } catch { throw notFound(); }
    if (r.userId !== req.user.id) throw notFound();
    if (r.paid) grantPass(req.user.id, 'stripe', req.params.id, (passPlan('id', r.plan) || FAMILY_PASS).days);
    return { paid: r.paid, pass: passView(req.user) };
  }));
  // Apple and Google purchases, checked with RevenueCat. The app calls this after buying and for "Restore purchases";
  // RevenueCat's webhook below does the same thing in the background.
  const planFor = (product) => passPlan('product_id', product);
  api.post('/family-pass/sync', requireAuth, wrap(async (req) => {
    if (!revenuecat) throw new HttpError(503, 'Payments are coming soon.');
    if (req.user.role !== 'family') throw forbidden('Only families need the Family Pass.');
    let list;
    try { list = await revenuecat.purchases(String(req.user.id)); }
    catch (e) { console.error('RevenueCat check failed:', e.message); throw new HttpError(502, 'We could not check your purchase. Try again in a moment.'); }
    // A purchase older than its own pass that was never counted would only add days nobody expects.
    let added = 0;
    for (const p of list) {
      const plan = planFor(p.product);
      if (plan && (!p.purchasedAt || Date.parse(p.purchasedAt) > Date.now() - plan.days * 86400000) && grantPass(req.user.id, p.store, p.ref, plan.days)) added++;
    }
    return { added, pass: passView(req.user) };
  }));
  api.post('/revenuecat/webhook', wrap((req) => {
    if (!webhookAuthorized(req.get('authorization'))) throw new HttpError(401, 'Not allowed.');
    const e = req.body?.event || {};
    const u = getUser(Number(e.app_user_id));
    const plan = planFor(e.product_id);
    if (!u || u.role !== 'family' || !plan || !e.transaction_id) return { received: true };
    const ref = String(e.transaction_id);
    if (e.type === 'NON_RENEWING_PURCHASE') grantPass(u.id, storeName(e.store), ref, plan.days);
    // A refund ends that pass now (or cancels it if it hadn't started); other passes keep their dates.
    if (e.type === 'CANCELLATION' || e.type === 'REFUND') {
      db.prepare("UPDATE passes SET starts_at = MIN(starts_at, datetime('now')), ends_at = MIN(ends_at, datetime('now')) WHERE user_id = ? AND source = ? AND ref = ?").run(u.id, storeName(e.store), ref);
    }
    return { received: true };
  }));

  // ID check (Stripe Identity). Each check costs money, so a person can start only a few a day.
  const ID_CHECKS_PER_DAY = 3;
  const idCheckDone = (userId, sessionId, status, error = null) => {
    db.prepare("UPDATE id_checks SET status = ?, error = ?, updated_at = datetime('now') WHERE session_id = ? AND user_id = ?").run(status, error, sessionId, userId);
    const u = getUser(userId);
    if (status === 'verified' && u && !u.id_verified) {
      db.prepare('UPDATE users SET id_verified = 1 WHERE id = ?').run(userId);
      notify(userId, 'verification', 'Your ID is verified. Your profile now shows the ID verified badge.', {}, '#/profile');
      checkProfileReward(userId);
    }
  };
  const latestIdCheck = (userId) => db.prepare('SELECT * FROM id_checks WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(userId);
  const idCheckView = (u, c) => ({ available: !!identity, verified: !!u.id_verified, status: u.id_verified ? 'verified' : c?.status || 'none', error: c?.error || null });

  api.get('/me/id-check', requireAuth, wrap(async (req) => {
    let c = latestIdCheck(req.user.id);
    // Ask Stripe for news in case its webhook hasn't arrived (or isn't set up).
    if (identity && c && ['requires_input', 'processing'].includes(c.status) && !req.user.id_verified) {
      try { const s = await identity.status(c.session_id); if (s.status !== c.status || s.error !== c.error) idCheckDone(req.user.id, c.session_id, s.status, s.error); } catch (e) { console.error('ID check status failed:', e.message); }
      c = latestIdCheck(req.user.id);
    }
    return idCheckView(getUser(req.user.id), c);
  }));
  api.post('/me/id-check', requireAuth, wrap(async (req) => {
    if (!identity) throw new HttpError(503, "ID check isn't available yet.");
    if (req.user.id_verified) throw new HttpError(409, 'Your ID is already verified.');
    const today = db.prepare("SELECT COUNT(*) n FROM id_checks WHERE user_id = ? AND created_at > datetime('now', '-1 day')").get(req.user.id).n;
    if (today >= ID_CHECKS_PER_DAY) throw new HttpError(429, 'You have started several ID checks today. Try again tomorrow.');
    // The website gets people back to its own Account page; the apps use a page that points back to the app.
    const s = await identity.start(req.user, req.body?.from === 'web' ? `${publicBase()}/#/account` : `${publicBase()}/id-check-done`);
    db.prepare('INSERT INTO id_checks (session_id, user_id, status) VALUES (?,?,?)').run(s.id, req.user.id, s.status || 'requires_input');
    return { url: s.url };
  }));
  const stripeWebhook = (req, res) => {
    const event = verifyWebhook(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '', req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
    if (!event) return res.status(400).json({ error: 'Bad signature.' });
    const s = event.data?.object;
    if (String(event.type).startsWith('identity.verification_session.') && s?.id) {
      const row = db.prepare('SELECT user_id FROM id_checks WHERE session_id = ?').get(s.id);
      if (row) idCheckDone(row.user_id, s.id, s.status, s.last_error?.code || null);
    }
    if (event.type === 'checkout.session.completed' && s?.id && s.metadata?.product === 'family_pass' && s.payment_status === 'paid') {
      const u = getUser(Number(s.metadata.user_id));
      if (u) grantPass(u.id, 'stripe', s.id, (passPlan('id', s.metadata.plan) || FAMILY_PASS).days);
    }
    res.json({ received: true });
  };

  api.post('/me/push-token', requireAuth, wrap((req) => {
    const token = String(req.body?.token || '');
    if (!isPushToken(token)) throw bad('That is not a push token.');
    // A phone belongs to whoever signed in last on it.
    db.prepare('INSERT INTO push_tokens (token, user_id) VALUES (?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id').run(token, req.user.id);
    return { ok: true };
  }));

  // ---------- photos ----------
  const setPhotos = (userId, photos) => db.prepare('UPDATE users SET photos = ?, photo_url = ? WHERE id = ?').run(JSON.stringify(photos), photos[0] || null, userId);

  api.post('/me/photos', requireAuth, wrap(async (req, res) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data_url || ''));
    if (!m) throw bad('Upload a JPEG, PNG or WebP image.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_PHOTO_BYTES) throw bad('Photos must be under 5 MB.');
    // Check magic bytes so the declared type can't lie.
    const sig = buf.subarray(0, 12).toString('hex');
    const real = sig.startsWith('ffd8ff') ? 'image/jpeg' : sig.startsWith('89504e47') ? 'image/png'
      : sig.startsWith('52494646') && sig.slice(16, 24) === '57454250' ? 'image/webp' : null;
    if (!real) throw bad('That file is not a valid image.');
    const keep = (list) => list.filter((p) => storage.owns(p) || p.startsWith('http'));
    if (keep(photosOf(getUser(req.user.id))).length >= MAX_PHOTOS) throw bad(`You can have up to ${MAX_PHOTOS} photos.`);
    const check = moderator ? await moderator(buf, real) : null;
    if (check?.verdict === 'reject') {
      console.log(`Photo rejected for user ${req.user.id}: ${check.category}`);
      throw bad("This photo can't be used on PairMundo. Please choose a different one.");
    }
    // Children may appear only with their parents' permission (see the Terms); the app asks, then uploads again.
    if (check?.category === 'child_in_photo' && req.body?.child_permission !== true) {
      throw new HttpError(400, "This photo shows children. Please confirm you are their parent or guardian, or have their parents' permission, to post it.", 'child_permission');
    }
    const url = await storage.save(`${req.user.id}-${randomBytes(8).toString('hex')}.${PHOTO_TYPES[real]}`, buf, real);
    if (check?.verdict === 'review') {
      // Goes live, and admins get a report to look at. Filed by the first admin, since nobody reported it.
      const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
      db.prepare('INSERT INTO reports (reporter_id, target_user_id, reason) VALUES (?,?,?)')
        .run(admin?.id ?? req.user.id, req.user.id, `Automatic photo check (${check.category}): ${check.note} Photo: ${url}`);
    }
    // Read the list again after the upload, in case another upload finished meanwhile.
    const photos = [...keep(photosOf(getUser(req.user.id))), url];
    setPhotos(req.user.id, photos);
    checkProfileReward(req.user.id);
    res.status(201);
    return { photos };
  }));

  api.put('/me/photos', requireAuth, wrap((req) => {
    // Reorder or remove: body.photos must be a subset of the current photos.
    const current = photosOf(getUser(req.user.id));
    const next = Array.isArray(req.body?.photos) ? req.body.photos.filter((p, i, a) => current.includes(p) && a.indexOf(p) === i) : null;
    if (!next) throw bad('Send the photo list.');
    for (const p of current.filter((x) => !next.includes(x))) storage.remove(p);
    setPhotos(req.user.id, next);
    return { photos: next };
  }));


  // ---------- favorites ----------
  api.get('/favorites', requireAuth, wrap((req) => ({
    results: db.prepare('SELECT u.* FROM favorites f JOIN users u ON u.id = f.target_id WHERE f.user_id = ? ORDER BY f.created_at DESC')
      .all(req.user.id).map((u) => ({ user: publicUser(u), rating: ratingSummary(u.id) })),
  })));
  api.post('/favorites/:id', requireAuth, wrap((req) => {
    const t = getUser(req.params.id);
    if (!t || t.id === req.user.id) throw notFound();
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, target_id) VALUES (?, ?)').run(req.user.id, t.id);
    return { ok: true };
  }));
  api.delete('/favorites/:id', requireAuth, wrap((req) => {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND target_id = ?').run(req.user.id, Number(req.params.id));
    return { ok: true };
  }));

  // ---------- match requests ----------
  api.post('/requests', requireRole('aupair', 'family'), wrap((req, res) => {
    const to = getUser(req.body?.to_user);
    if (!to || to.suspended || to.role === req.user.role || to.role === 'admin') throw bad('You can only contact the other side (au pair ↔ host family).');
    if (blockedBetween(req.user.id, to.id)) throw notFound('Profile not found.');
    mustBeVerified(req.user);
    const open = db.prepare(`SELECT id FROM match_requests WHERE status IN ('pending','accepted')
        AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))`).get(req.user.id, to.id, to.id, req.user.id);
    if (open) throw new HttpError(409, 'You already have an open request with this person.');
    const r = db.prepare('INSERT INTO match_requests (from_user, to_user, message) VALUES (?, ?, ?)')
      .run(req.user.id, to.id, str(req.body?.message, 2000));
    notify(to.id, 'request', '{name} is interested in matching with you.', { name: req.user.name }, '#/requests');
    res.status(201);
    return { id: Number(r.lastInsertRowid) };
  }));

  api.get('/requests', requireAuth, wrap((req) => {
    const rows = db.prepare(`SELECT r.*, fu.name from_name, fu.role from_role, fu.country from_country, fu.photo_url from_photo,
          tu.name to_name, tu.role to_role, tu.country to_country, tu.photo_url to_photo
        FROM match_requests r JOIN users fu ON fu.id = r.from_user JOIN users tu ON tu.id = r.to_user
        WHERE r.from_user = ? OR r.to_user = ? ORDER BY r.created_at DESC`).all(req.user.id, req.user.id);
    return {
      // Pending likes stay hidden without the Family Pass, as on the Likes screen.
      incoming: rows.filter((r) => r.to_user === req.user.id && !(r.status === 'pending' && needsPass(req.user))),
      outgoing: rows.filter((r) => r.from_user === req.user.id),
    };
  }));

  api.post('/requests/:id/respond', requireAuth, wrap((req) => {
    const r = db.prepare('SELECT * FROM match_requests WHERE id = ?').get(Number(req.params.id));
    if (!r) throw notFound();
    const action = req.body?.action;
    const me = req.user.id;
    if (r.status !== 'pending') throw bad('This request was already answered.');
    if (action === 'withdraw') {
      if (r.from_user !== me) throw forbidden();
      db.prepare("UPDATE match_requests SET status = 'withdrawn', responded_at = datetime('now') WHERE id = ?").run(r.id);
    } else if (action === 'accept' || action === 'decline') {
      if (r.to_user !== me) throw forbidden();
      const status = action === 'accept' ? 'accepted' : 'declined';
      if (status === 'accepted') acceptRequest(r);
      else db.prepare("UPDATE match_requests SET status = 'declined', responded_at = datetime('now') WHERE id = ?").run(r.id);
      db.prepare('INSERT OR REPLACE INTO swipes (user_id, target_id, direction) VALUES (?,?,?)').run(me, r.from_user, status === 'accepted' ? 'like' : 'pass');
      if (status === 'accepted') notify(r.from_user, 'match', "It's a match! {name} liked you back.", { name: req.user.name }, '#/matches');
    } else throw bad('Unknown action.');
    return { ok: true };
  }));

  // ---------- messaging ----------
  api.get('/conversations', requireAuth, wrap((req) => {
    const me = req.user.id;
    return {
      conversations: db.prepare(`SELECT c.id, CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END other_id,
            (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) last_body,
            (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) last_at,
            (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) unread
          FROM conversations c WHERE c.user_a = ? OR c.user_b = ? ORDER BY COALESCE(last_at, c.created_at) DESC`)
        .all(me, me, me, me).filter((c) => !blockedBetween(me, c.other_id)).map((c) => ({ ...c, other: publicUser(getUser(c.other_id)) })),
    };
  }));

  api.post('/conversations', requireAuth, wrap((req) => {
    const other = getUser(req.body?.user_id);
    if (!other || other.id === req.user.id || blockedBetween(req.user.id, other.id)) throw notFound();
    mustBeVerified(req.user);
    // Safety: messaging opens only after a match request is accepted (admins can always reach users).
    if (req.user.role !== 'admin' && other.role !== 'admin' && !acceptedRequestBetween(req.user.id, other.id)) {
      throw forbidden('Send a match request first; messaging opens once it is accepted.');
    }
    return { id: conversationFor(req.user.id, other.id, true).id };
  }));

  const myConversation = (req) => {
    const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(Number(req.params.id));
    if (!c || (c.user_a !== req.user.id && c.user_b !== req.user.id)) throw notFound();
    if (blockedBetween(c.user_a, c.user_b)) throw notFound();
    return c;
  };

  api.get('/conversations/:id/messages', requireAuth, wrap((req) => {
    const c = myConversation(req);
    const after = Number(req.query.after) || 0;
    db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL").run(c.id, req.user.id);
    const otherId = c.user_a === req.user.id ? c.user_b : c.user_a;
    return {
      other: publicUser(getUser(otherId)),
      messages: db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id`).all(c.id, after),
    };
  }));

  api.post('/conversations/:id/messages', requireAuth, wrap((req, res) => {
    const c = myConversation(req);
    mustBeVerified(req.user);
    mustHavePass(req.user);
    const body = str(req.body?.body, 4000);
    if (!body) throw bad('Message is empty.');
    const r = db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)').run(c.id, req.user.id, body);
    push(c.user_a === req.user.id ? c.user_b : c.user_a, body.length > 140 ? `${body.slice(0, 139)}…` : body, `#/messages/${c.id}`, req.user.name);
    res.status(201);
    return db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`).get(Number(r.lastInsertRowid));
  }));

  // ---------- video calls ----------
  // Starting a call posts a call message in the chat; both people join from it while it is open.
  const openCall = (c) => db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE conversation_id = ? AND call_url IS NOT NULL
    AND created_at > datetime('now', ?) ORDER BY id DESC LIMIT 1`).get(c.id, `-${CALL_HOURS} hours`);
  api.post('/conversations/:id/calls', requireAuth, wrap(async (req, res) => {
    const c = myConversation(req);
    mustBeVerified(req.user);
    mustHavePass(req.user);
    const existing = openCall(c);
    if (existing) return existing;
    const url = await video.createRoom();
    const r = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, call_url) VALUES (?,?,?,?)').run(c.id, req.user.id, '📹 Video call', url);
    const other = getUser(c.user_a === req.user.id ? c.user_b : c.user_a);
    push(other.id, translate(other.lang, '{name} started a video call. Tap to join.', { name: req.user.name }), `#/messages/${c.id}`, req.user.name);
    res.status(201);
    return db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`).get(Number(r.lastInsertRowid));
  }));
  api.post('/conversations/:id/calls/:messageId/join', requireAuth, wrap(async (req) => {
    const c = myConversation(req);
    const m = db.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND call_url IS NOT NULL').get(Number(req.params.messageId), c.id);
    if (!m) throw notFound();
    if (openCall(c)?.id !== m.id) throw new HttpError(410, 'This call has ended. Start a new one.');
    return { url: await video.joinUrl(m.call_url, req.user.name) };
  }));

  // ---------- programs & compliance ----------
  api.get('/programs', wrap(() => ({
    programs: db.prepare('SELECT * FROM country_programs ORDER BY name').all()
      .map((p) => ({ ...p, family_obligations: json.parse(p.family_obligations) })),
    review_criteria: REVIEW_CRITERIA,
  })));
  api.get('/programs/:code', wrap((req) => {
    const p = getProgram(String(req.params.code).toUpperCase());
    if (!p) throw notFound('No program on file for this country.');
    return p;
  }));
  api.put('/programs/:code', requireRole('admin'), wrap((req) => {
    const code = String(req.params.code).toUpperCase();
    const b = req.body || {};
    const fields = ['name', 'currency', 'visa', 'min_age', 'max_age', 'max_weekly_hours', 'max_daily_hours', 'min_pocket_money',
      'pocket_money_note', 'min_months', 'max_months', 'agency_required', 'notes', 'official_source', 'status', 'status_note', 'eu_eea_only'];
    if ('status' in b && !['open', 'paused', 'closed'].includes(b.status)) throw bad('Status must be open, paused or closed.');
    if (!getProgram(code)) {
      if (!b.name || !b.currency || !b.visa || b.min_age == null || b.max_age == null || b.max_weekly_hours == null) throw bad('New programs need name, currency, visa, ages and max weekly hours.');
      db.prepare('INSERT INTO country_programs (code, name, currency, visa, min_age, max_age, max_weekly_hours) VALUES (?,?,?,?,?,?,?)')
        .run(code, b.name, b.currency, b.visa, b.min_age, b.max_age, b.max_weekly_hours);
    }
    const sets = fields.filter((k) => k in b);
    const vals = sets.map((k) => sql(b[k] === '' ? null : b[k]));
    if ('family_obligations' in b) { sets.push('family_obligations'); vals.push(json.str(b.family_obligations)); }
    sets.push('last_reviewed', 'admin_edited'); vals.push(new Date().toISOString().slice(0, 7), 1);
    db.prepare(`UPDATE country_programs SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE code = ?`).run(...vals, code);
    return getProgram(code);
  }));

  // ---------- placements ----------
  const placementParties = (other, me) => {
    if (!other || other.role === me.role || other.role === 'admin') throw bad('A placement is between one au pair and one host family.');
    return me.role === 'aupair' ? { ap: me, fam: other } : { ap: other, fam: me };
  };

  api.post('/compliance/check', requireAuth, wrap((req) => {
    const b = req.body || {};
    const other = getUser(b.other_user_id);
    const { ap, fam } = placementParties(other, req.user);
    const apProfile = getProfile(ap);
    return checkCompliance(getProgram(fam.country), { ...b, birth_date: apProfile?.birth_date, nationality: apProfile?.nationality }, req.user.lang);
  }));

  api.post('/placements', requireRole('aupair', 'family'), wrap((req, res) => {
    const b = req.body || {};
    const other = getUser(b.other_user_id);
    const { ap, fam } = placementParties(other, req.user);
    mustBeVerified(req.user);
    if (blockedBetween(ap.id, fam.id)) throw notFound();
    if (!acceptedRequestBetween(ap.id, fam.id)) throw forbidden('You need an accepted match request before proposing a placement.');
    if (!isDate(b.start_date) || !isDate(b.end_date)) throw bad('Start and end dates are required (YYYY-MM-DD).');
    const weekly = Number(b.weekly_hours); const money = Number(b.pocket_money);
    if (!(weekly > 0) || !(money >= 0)) throw bad('Weekly hours and pocket money are required.');
    const open = db.prepare(`SELECT 1 FROM placements WHERE aupair_id = ? AND family_id = ? AND status IN ('proposed','confirmed','active')`).get(ap.id, fam.id);
    if (open) throw new HttpError(409, 'There is already an open placement between you.');
    const program = getProgram(fam.country);
    const compliance = checkCompliance(program, { birth_date: getProfile(ap)?.birth_date, nationality: getProfile(ap)?.nationality, start_date: b.start_date, end_date: b.end_date, weekly_hours: weekly, pocket_money: money }, req.user.lang);
    if (!compliance.ok) { res.status(422); return { error: 'This placement breaks the country program rules.', compliance }; }
    const id = tx(db, () => {
      const r = db.prepare(`INSERT INTO placements (aupair_id, family_id, country, start_date, end_date, weekly_hours, pocket_money,
          aupair_confirmed, family_confirmed, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(ap.id, fam.id, fam.country || '', b.start_date, b.end_date, weekly, money,
          req.user.role === 'aupair' ? 1 : 0, req.user.role === 'family' ? 1 : 0, req.user.id);
      const pid = Number(r.lastInsertRowid);
      const start = new Date(b.start_date).getTime(); const end = new Date(b.end_date).getTime();
      const ins = db.prepare('INSERT INTO placement_tasks (placement_id, title, owner, due_date, sort) VALUES (?,?,?,?,?)');
      PLACEMENT_TASKS.forEach((t, i) => {
        const due = t.offset === 'mid' ? (start + end) / 2 : t.offset === 'end' ? end : start + t.offset * 86400000;
        ins.run(pid, t.title, t.owner, new Date(due).toISOString().slice(0, 10), i);
      });
      return pid;
    });
    notify(other.id, 'placement', '{name} proposed a placement. Review and confirm it.', { name: req.user.name }, `#/placements/${id}`);
    res.status(201);
    return { id, compliance };
  }));

  const loadPlacement = (req) => {
    const p = db.prepare('SELECT * FROM placements WHERE id = ?').get(Number(req.params.id));
    if (!p || (req.user.role !== 'admin' && p.aupair_id !== req.user.id && p.family_id !== req.user.id)) throw notFound();
    return p;
  };
  const placementView = (p, me) => {
    const ap = getUser(p.aupair_id); const fam = getUser(p.family_id);
    const program = getProgram(p.country);
    const myReview = db.prepare('SELECT * FROM reviews WHERE placement_id = ? AND reviewer_id = ?').get(p.id, me.id);
    return {
      ...p,
      aupair: publicUser(ap), family: publicUser(fam),
      program: program ? { code: program.code, name: program.name, currency: program.currency, visa: program.visa } : null,
      compliance: checkCompliance(program, { ...p, birth_date: getProfile(ap)?.birth_date, nationality: getProfile(ap)?.nationality }, me.lang),
      tasks: db.prepare('SELECT * FROM placement_tasks WHERE placement_id = ? ORDER BY sort').all(p.id),
      my_review: myReview ? { ...myReview, criteria: json.parse(myReview.criteria, {}) } : null,
      can_review: me.role !== 'admin' && ['active', 'completed'].includes(p.status) && !myReview,
      review_criteria: REVIEW_CRITERIA[me.id === p.aupair_id ? 'family' : 'aupair'],
    };
  };

  api.get('/placements', requireAuth, wrap((req) => {
    const rows = req.user.role === 'admin'
      ? db.prepare('SELECT * FROM placements ORDER BY created_at DESC').all()
      : db.prepare('SELECT * FROM placements WHERE aupair_id = ? OR family_id = ? ORDER BY created_at DESC').all(req.user.id, req.user.id);
    return {
      placements: rows.map((p) => ({ ...p, aupair: publicUser(getUser(p.aupair_id)), family: publicUser(getUser(p.family_id)),
        tasks_done: db.prepare('SELECT COUNT(*) n FROM placement_tasks WHERE placement_id = ? AND done = 1').get(p.id).n,
        tasks_total: db.prepare('SELECT COUNT(*) n FROM placement_tasks WHERE placement_id = ?').get(p.id).n })),
    };
  }));

  api.get('/placements/:id', requireAuth, wrap((req) => placementView(loadPlacement(req), req.user)));

  api.post('/placements/:id/confirm', requireRole('aupair', 'family'), wrap((req) => {
    const p = loadPlacement(req);
    if (p.status !== 'proposed') throw bad('Only proposed placements can be confirmed.');
    const col = req.user.id === p.aupair_id ? 'aupair_confirmed' : 'family_confirmed';
    db.prepare(`UPDATE placements SET ${col} = 1 WHERE id = ?`).run(p.id);
    const fresh = db.prepare('SELECT * FROM placements WHERE id = ?').get(p.id);
    if (fresh.aupair_confirmed && fresh.family_confirmed) {
      db.prepare("UPDATE placements SET status = 'confirmed' WHERE id = ?").run(p.id);
      for (const uid of [p.aupair_id, p.family_id]) notify(uid, 'placement', 'Your placement is confirmed. Work through the checklist together.', {}, `#/placements/${p.id}`);
    }
    return placementView(db.prepare('SELECT * FROM placements WHERE id = ?').get(p.id), req.user);
  }));

  const TRANSITIONS = { proposed: ['cancelled'], confirmed: ['active', 'cancelled'], active: ['completed', 'cancelled'] };
  api.post('/placements/:id/status', requireAuth, wrap((req) => {
    const p = loadPlacement(req);
    const next = req.body?.status;
    if (!(TRANSITIONS[p.status] || []).includes(next)) throw bad(`Cannot move a ${p.status} placement to ${next}.`);
    db.prepare('UPDATE placements SET status = ? WHERE id = ?').run(next, p.id);
    const other = req.user.id === p.aupair_id ? p.family_id : p.aupair_id;
    notify(other, 'placement', next === 'cancelled' ? 'Your placement was cancelled.' : `Your placement is now ${next}.`, {}, `#/placements/${p.id}`);
    // The stay has started: whoever an ambassador brought in, on either side, earns them the placement reward.
    if (next === 'active') for (const uid of [p.aupair_id, p.family_id]) addReward(uid, 'placement', AMBASSADOR_REWARDS.placement, `Placement ${p.id}`);
    if (next === 'completed') {
      for (const uid of [p.aupair_id, p.family_id]) notify(uid, 'review', 'Your placement ended. Leave a review to help the community.', {}, `#/placements/${p.id}`);
    }
    return placementView(db.prepare('SELECT * FROM placements WHERE id = ?').get(p.id), req.user);
  }));

  api.patch('/placements/:id/tasks/:taskId', requireAuth, wrap((req) => {
    const p = loadPlacement(req);
    const r = db.prepare('UPDATE placement_tasks SET done = ? WHERE id = ? AND placement_id = ?').run(req.body?.done ? 1 : 0, Number(req.params.taskId), p.id);
    if (!r.changes) throw notFound();
    return { ok: true };
  }));

  // ---------- reviews ----------
  api.post('/placements/:id/review', requireRole('aupair', 'family'), wrap((req, res) => {
    const p = loadPlacement(req);
    if (!['active', 'completed'].includes(p.status)) throw bad('Reviews open once the placement has started.');
    const b = req.body || {};
    const overall = Number(b.overall);
    if (!Number.isInteger(overall) || overall < 1 || overall > 5) throw bad('Overall rating must be 1 to 5 stars.');
    const revieweeIsAupair = req.user.id === p.family_id;
    const allowed = REVIEW_CRITERIA[revieweeIsAupair ? 'aupair' : 'family'];
    const criteria = {};
    for (const k of allowed) {
      const v = Number(b.criteria?.[k]);
      if (b.criteria?.[k] != null) {
        if (!Number.isInteger(v) || v < 1 || v > 5) throw bad(`${k} must be 1 to 5.`);
        criteria[k] = v;
      }
    }
    if (db.prepare('SELECT 1 FROM reviews WHERE placement_id = ? AND reviewer_id = ?').get(p.id, req.user.id)) throw new HttpError(409, 'You already reviewed this placement.');
    const reviewee = revieweeIsAupair ? p.aupair_id : p.family_id;
    const r = db.prepare('INSERT INTO reviews (placement_id, reviewer_id, reviewee_id, overall, criteria, comment) VALUES (?,?,?,?,?,?)')
      .run(p.id, req.user.id, reviewee, overall, JSON.stringify(criteria), str(b.comment, 3000));
    notify(reviewee, 'review', '{name} left you a review. It appears once you review them too, or {days} days after the placement ends.', { name: req.user.name, days: REVIEW_REVEAL_DAYS }, `#/placements/${p.id}`);
    res.status(201);
    return { id: Number(r.lastInsertRowid) };
  }));

  api.post('/reviews/:id/response', requireAuth, wrap((req) => {
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(Number(req.params.id));
    if (!r || r.reviewee_id !== req.user.id) throw notFound();
    if (r.response) throw bad('You already responded to this review.');
    const text = str(req.body?.response, 1500);
    if (!text) throw bad('Response is empty.');
    db.prepare('UPDATE reviews SET response = ? WHERE id = ?').run(text, r.id);
    return { ok: true };
  }));

  // ---------- reports & notifications ----------
  api.post('/reports', requireAuth, wrap((req, res) => {
    const b = req.body || {};
    const reason = str(b.reason, 2000);
    if (!reason) throw bad('Tell us what happened.');
    if (!b.target_user_id && !b.review_id) throw bad('Nothing to report.');
    db.prepare('INSERT INTO reports (reporter_id, target_user_id, review_id, reason) VALUES (?,?,?,?)')
      .run(req.user.id, sql(b.target_user_id ? Number(b.target_user_id) : null), sql(b.review_id ? Number(b.review_id) : null), reason);
    res.status(201);
    return { ok: true };
  }));

  api.get('/notifications', requireAuth, wrap((req) => ({
    notifications: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id),
  })));
  api.post('/notifications/read', requireAuth, wrap((req) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    return { ok: true };
  }));

  // An ambassador's own numbers, shown in their app.
  api.get('/me/ambassador', requireAuth, wrap((req) => {
    const a = db.prepare('SELECT * FROM ambassadors WHERE user_id = ? AND active = 1').get(req.user.id);
    if (!a) throw notFound();
    return { code: a.code, name: a.name, link: referralLink(a), rewards: AMBASSADOR_REWARDS,
      this_month: ambassadorStats(a, new Date().toISOString().slice(0, 7)), total: ambassadorStats(a) };
  }));

  // ---------- admin ----------
  // A leading ' stops spreadsheet apps from running a cell that starts like a formula.
  const csvCell = (v) => { if (v == null) return ''; let s = String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  api.get('/admin/waitlist', requireRole('admin'), wrap(() => ({
    total: db.prepare('SELECT COUNT(*) n FROM waitlist').get().n,
    by_role: db.prepare('SELECT role, COUNT(*) n FROM waitlist GROUP BY role ORDER BY n DESC').all(),
    by_country: db.prepare('SELECT country, COUNT(*) n FROM waitlist GROUP BY country ORDER BY n DESC').all(),
    by_source: db.prepare('SELECT source, COUNT(*) n FROM waitlist GROUP BY source ORDER BY n DESC').all(),
    people: db.prepare('SELECT email, role, country, lang, source, created_at FROM waitlist ORDER BY created_at DESC, rowid DESC LIMIT 500').all(),
    signups_by_source: db.prepare("SELECT source, SUM(role = 'family') families, SUM(role = 'aupair') aupairs FROM users WHERE role != 'admin' GROUP BY source ORDER BY COUNT(*) DESC").all(),
  })));
  // The whole list as a spreadsheet file, for emailing everyone at launch.
  api.get('/admin/waitlist.csv', requireRole('admin'), (req, res) => {
    const rows = db.prepare('SELECT email, role, country, lang, source, ref_code, created_at FROM waitlist ORDER BY created_at').all();
    res.set('Content-Disposition', 'attachment; filename="pairmundo-waitlist.csv"').type('text/csv')
      .send(['email,role,country,language,source,referral code,joined', ...rows.map((r) => [r.email, r.role, r.country, r.lang, r.source, r.ref_code, r.created_at].map(csvCell).join(','))].join('\n') + '\n');
  });

  // Ambassadors: create them, see what each code brought in, and record payouts.
  const ambassadorFields = (body, a = {}) => {
    const name = 'name' in body ? str(body.name, 120) : a.name;
    if (!name) throw bad('Name is required.');
    let userId = a.user_id ?? null;
    if ('account_email' in body) {
      const email = normEmail(body.account_email);
      userId = email ? db.prepare("SELECT id FROM users WHERE lower(trim(email)) = ? AND role != 'admin'").get(email)?.id : null;
      if (email && !userId) throw bad('No PairMundo account uses that email.');
    }
    const text = (k, max) => (k in body ? str(body[k], max) || null : a[k] ?? null);
    return { name, country: text('country', 2)?.toUpperCase() ?? null, contact: text('contact', 200), notes: text('notes', 2000), user_id: userId,
      active: 'active' in body ? (body.active ? 1 : 0) : Number(a.active ?? 1) };
  };
  api.get('/admin/ambassadors', requireRole('admin'), wrap((req) => {
    const month = monthParam(req.query.month);
    return { month, rewards: AMBASSADOR_REWARDS,
      ambassadors: db.prepare('SELECT id FROM ambassadors ORDER BY active DESC, created_at DESC, id DESC').all().map((a) => adminAmbassador(a.id, month, false)) };
  }));
  api.post('/admin/ambassadors', requireRole('admin'), wrap((req, res) => {
    const code = referralCode(req.body?.code);
    if (!code) throw bad('A code is 3 to 24 letters, numbers or dashes, like ANACO.');
    if (db.prepare('SELECT 1 FROM ambassadors WHERE code = ?').get(code)) throw new HttpError(409, 'That code is already taken.');
    const f = ambassadorFields(req.body);
    const r = db.prepare('INSERT INTO ambassadors (code, name, country, contact, notes, user_id, active) VALUES (?,?,?,?,?,?,?)')
      .run(code, f.name, f.country, f.contact, f.notes, f.user_id, f.active);
    res.status(201);
    return adminAmbassador(r.lastInsertRowid);
  }));
  api.get('/admin/ambassadors/:id', requireRole('admin'), wrap((req) => adminAmbassador(req.params.id, monthParam(req.query.month))));
  // The code can't change: the people who joined with it keep pointing at it.
  api.post('/admin/ambassadors/:id', requireRole('admin'), wrap((req) => {
    const a = adminAmbassador(req.params.id, null, false);
    const f = ambassadorFields(req.body || {}, a);
    db.prepare('UPDATE ambassadors SET name = ?, country = ?, contact = ?, notes = ?, user_id = ?, active = ? WHERE id = ?')
      .run(f.name, f.country, f.contact, f.notes, f.user_id, f.active, a.id);
    return adminAmbassador(a.id);
  }));
  // After paying an ambassador, mark what they earned up to the end of that month (or everything) as paid.
  api.post('/admin/ambassadors/:id/paid', requireRole('admin'), wrap((req) => {
    const a = adminAmbassador(req.params.id, null, false);
    const month = monthParam(req.body?.month);
    const r = db.prepare(`UPDATE referral_rewards SET paid_at = datetime('now') WHERE ambassador_id = ? AND paid_at IS NULL${month ? " AND strftime('%Y-%m', created_at) <= ?" : ''}`)
      .run(a.id, ...(month ? [month] : []));
    return { marked: r.changes, ...adminAmbassador(a.id) };
  }));
  // The monthly payout sheet: one row per ambassador.
  api.get('/admin/ambassadors.csv', requireRole('admin'), (req, res) => {
    const month = monthParam(req.query.month);
    const usd = (c) => (c / 100).toFixed(2);
    const rows = db.prepare('SELECT * FROM ambassadors ORDER BY code').all().map((a) => {
      const s = ambassadorStats(a, month);
      return [a.code, a.name, a.country, a.contact, a.active ? 'yes' : 'no', s.waitlist, s.aupairs, s.families, s.profiles, s.passes, s.placements, usd(s.earned_cents), usd(s.owed_cents)];
    });
    res.set('Content-Disposition', `attachment; filename="pairmundo-ambassadors-${month || 'all-time'}.csv"`).type('text/csv')
      .send([`code,name,country,contact,active,waitlist,au pairs,families,au pair profiles,family passes,placements,earned ${month || 'all time'} (USD),owed now (USD)`,
        ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n');
  });
  api.get('/admin/backup', requireRole('admin'), wrap(() => backups.status()));
  api.post('/admin/backup', requireRole('admin'), wrap(async () => {
    if (!backups.enabled) throw bad(backups.status().problem);
    try { await backups.run(); } catch (e) { throw bad(`Backup failed: ${e.message}`); }
    return backups.status();
  }));
  api.get('/admin/stats', requireRole('admin'), wrap(() => {
    const n = (q, ...a) => db.prepare(q).get(...a).n;
    return {
      aupairs: n("SELECT COUNT(*) n FROM users WHERE role = 'aupair'"),
      families: n("SELECT COUNT(*) n FROM users WHERE role = 'family'"),
      pending_verification: n("SELECT COUNT(*) n FROM users WHERE role != 'admin' AND id_verified = 0"),
      open_requests: n("SELECT COUNT(*) n FROM match_requests WHERE status = 'pending'"),
      matches: n("SELECT COUNT(*) n FROM match_requests WHERE status = 'accepted'"),
      placements_active: n("SELECT COUNT(*) n FROM placements WHERE status IN ('confirmed','active')"),
      placements_completed: n("SELECT COUNT(*) n FROM placements WHERE status = 'completed'"),
      reviews: n('SELECT COUNT(*) n FROM reviews'),
      open_reports: n("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
      waitlist: n('SELECT COUNT(*) n FROM waitlist'),
      by_country: db.prepare("SELECT country, role, COUNT(*) n FROM users WHERE role != 'admin' GROUP BY country, role ORDER BY n DESC").all(),
    };
  }));
  api.get('/admin/users', requireRole('admin'), wrap((req) => {
    const like = `%${req.query.q || ''}%`;
    return {
      users: db.prepare("SELECT * FROM users WHERE role != 'admin' AND (name LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT 200").all(like, like)
        .map((u) => ({ ...publicUser(u), email: u.email, suspended: !!u.suspended, rating: ratingSummary(u.id), source: u.source, pass_ends_at: u.role === 'family' ? activePass(u.id)?.ends_at ?? null : undefined })),
    };
  }));
  api.post('/admin/users/:id', requireRole('admin'), wrap((req) => {
    const u = getUser(req.params.id);
    if (!u || u.role === 'admin') throw notFound();
    const map = { id_verified: 'id_verified', references_checked: 'references_checked', background_checked: 'background_checked', suspended: 'suspended' };
    const sets = Object.keys(map).filter((k) => k in (req.body || {}));
    // An admin can give a family a free pass (for example to test, or as a goodwill gesture).
    const passDays = Number(req.body?.grant_pass_days);
    if (passDays > 0 && passDays <= 400 && u.role === 'family') { grantPass(u.id, 'admin', null, passDays); if (!sets.length) return { ...publicUser(getUser(u.id)), pass: passView(u) }; }
    if (!sets.length) throw bad('Nothing to change.');
    db.prepare(`UPDATE users SET ${sets.map((k) => `${map[k]} = ?`).join(', ')} WHERE id = ?`).run(...sets.map((k) => (req.body[k] ? 1 : 0)), u.id);
    if (req.body.suspended) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    if (sets.some((k) => k !== 'suspended' && req.body[k])) notify(u.id, 'verification', 'Your profile has a new verification badge.', {}, '#/profile');
    if (req.body.id_verified) checkProfileReward(u.id);
    return { ...publicUser(getUser(u.id)), suspended: !!getUser(u.id).suspended };
  }));
  api.get('/admin/reports', requireRole('admin'), wrap(() => ({
    reports: db.prepare(`SELECT rp.*, ru.name reporter_name, tu.name target_name, rv.comment review_comment, rv.hidden review_hidden
        FROM reports rp JOIN users ru ON ru.id = rp.reporter_id LEFT JOIN users tu ON tu.id = rp.target_user_id
        LEFT JOIN reviews rv ON rv.id = rp.review_id ORDER BY rp.status = 'open' DESC, rp.created_at DESC`).all(),
  })));
  api.post('/admin/reports/:id', requireRole('admin'), wrap((req) => {
    const rp = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id));
    if (!rp) throw notFound();
    const status = req.body?.status;
    if (!['open', 'resolved', 'dismissed'].includes(status)) throw bad('Unknown status.');
    tx(db, () => {
      db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, rp.id);
      if (rp.review_id && 'hide_review' in req.body) db.prepare('UPDATE reviews SET hidden = ? WHERE id = ?').run(req.body.hide_review ? 1 : 0, rp.review_id);
    });
    return { ok: true };
  }));

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/uploads', (_req, res, next) => { res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"); next(); },
    express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] })); // /privacy and /terms
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError || (err.status && err.status < 500)) return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}

function setCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.set('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`);
}
