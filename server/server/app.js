import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { json, tx } from './db.js';
import { hashPassword, verifyPassword, createSession, sessionMiddleware, requireAuth, requireRole, rateLimit } from './auth.js';
import { scoreMatch, checkCompliance, ageOn } from './matching.js';
import { PROGRAMS, REVIEW_CRITERIA, familyDocuments, placementTaskList, visaRoute } from './programs.js';
import { buildAgreement, buildHostLetter, cleanTerms, defaultTerms, REQUIRED_TERMS } from './agreement.js';
import { createMailer, agencyLeadEmail, ambassadorInviteEmail, codeEmail, launchEmail, profileInviteEmail, referenceEmail, waitlistEmail } from './mailer.js';
import { countryName, pickLang, t as translate } from './i18n.js';
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
// Asked during family onboarding: "Would you also use PairMundo to find a babysitter?" Private: only the family and admins see it.
const SITTER_ANSWERS = ['yes', 'maybe', 'no'];
// Checklist steps a partner offer can sit on, found from the step's title.
const PARTNER_SLOTS = { insurance: /insurance/i, travel: /^Book travel$/, language: /language course|Swedish course|French classes/i, arrival: /^Arrival and local registration$/,
  sponsor: /designated au pair sponsor|recognised au pair agency/i };
const REFERRAL_STATUSES = ['referred', 'in_process', 'started', 'not_going'];
const taskSlot = (title) => Object.keys(PARTNER_SLOTS).find((k) => PARTNER_SLOTS[k].test(title)) || null;
// Reviews become visible once both sides have reviewed, or 14 days after the placement ends.
const REVIEW_REVEAL_DAYS = 14;
const CODE_MINUTES = 30;
const CODE_MAX_ATTEMPTS = 5;

/** The Family Pass: what families buy to message au pairs, as 1 or 3 months paid once. */
// amount/currency are the website price (Stripe). product_id is the one-off (consumable) in-app product set up in
// App Store Connect, Google Play and RevenueCat; the stores charge their own listed price.
export const PASS_PLANS = [
  { id: 'month', days: 30, price: '€39', amount: 3900, currency: 'eur', product_id: 'family_pass_30', ios_product_id: 'family_pass_1m', name: 'PairMundo Family Pass (1 month)' },
  { id: 'quarter', days: 90, price: '€79', amount: 7900, currency: 'eur', product_id: 'family_pass_90', name: 'PairMundo Family Pass (3 months)' },
  { id: 'half', days: 180, price: '€119', amount: 11900, currency: 'eur', product_id: 'family_pass_180', name: 'PairMundo Family Pass (6 months)' },
];
// The 3-month pass is the default, and what app versions from before the 1-month pass show.
export const FAMILY_PASS = PASS_PLANS[1];
const passPlan = (key, value) => PASS_PLANS.find((p) => p[key] === value);
// Apple never lets a deleted product ID be reused, so a plan can have a different ID on the App Store.
const planFor = (product) => PASS_PLANS.find((p) => p.product_id === product || p.ios_product_id === product);
/** The Rematch Guarantee: paid once, it covers one placement. If the placement is cancelled before the stay starts or
 *  within cover_days of the start date, the family gets pass_days of the Family Pass free to find the next au pair. */
export const REMATCH = { id: 'rematch', price: '€29', amount: 2900, currency: 'eur', product_id: 'rematch_guarantee', name: 'PairMundo Rematch Guarantee', cover_days: 183, pass_days: 90 };
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
  app.use('/api/me/certificates', express.json({ limit: '8mb' }));
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
  /** "Maria García López" → "Maria G.": the name other members see. */
  const shortName = (name) => {
    const w = String(name || '').trim().split(/\s+/);
    return w.length < 2 ? w[0] : `${w[0]} ${Array.from(w[w.length - 1])[0].toLocaleUpperCase()}.`;
  };
  /** The full name is for the person themselves, admins, and the other side of a confirmed placement (contracts and visa papers need it). */
  const seesFullName = (viewer, u) => !!viewer && (viewer.id === u.id || viewer.role === 'admin'
    || !!db.prepare(`SELECT 1 FROM placements WHERE status IN ('confirmed', 'active', 'completed')
        AND ((aupair_id = ? AND family_id = ?) OR (aupair_id = ? AND family_id = ?))`).get(viewer.id, u.id, u.id, viewer.id));
  /** The partner agency an au pair joined with, shown on their profile so families know who prepared them. */
  const agencyOf = (u) => (u.role === 'aupair' && u.ref_code
    ? db.prepare("SELECT name FROM ambassadors WHERE code = ? AND kind = 'agency' AND active = 1").get(u.ref_code)?.name ?? null : null);
  /** A member as `viewer` may see them. With no viewer, only the short name is shown. */
  const publicUser = (u, viewer = null) => u && ({
    id: u.id, role: u.role, name: seesFullName(viewer, u) ? u.name : shortName(u.name), country: u.country, city: u.city, photo_url: photosOf(u)[0] || null, photos: photosOf(u),
    verification: { id: !!u.id_verified, references: !!u.references_checked, background: !!u.background_checked },
    agency: agencyOf(u),
    member_since: u.created_at, last_active_at: u.last_active_at,
  });

  const getProfile = (user) => {
    if (user.role === 'aupair') {
      const p = db.prepare('SELECT * FROM aupair_profiles WHERE user_id = ?').get(user.id);
      if (!p) return null;
      for (const k of AP_JSON) p[k] = json.parse(p[k]);
      p.age = ageOn(p.birth_date);
      const checked = new Set(db.prepare("SELECT kind FROM certificate_proofs WHERE user_id = ? AND status = 'verified'").all(user.id).map((r) => r.kind));
      p.certificates = p.certificates.map((c) => ({ ...c, verified: checked.has(c.kind) }));
      return p;
    }
    if (user.role === 'family') {
      const p = db.prepare('SELECT * FROM family_profiles WHERE user_id = ?').get(user.id);
      if (!p) return null;
      for (const k of FAM_JSON) p[k] = json.parse(p[k]);
      delete p.wants_sitter;
      return p;
    }
    return null;
  };
  /** The member's own profile, with the private answers others must not see. */
  const ownProfile = (user) => {
    const p = getProfile(user);
    if (p && user.role === 'family') p.wants_sitter = db.prepare('SELECT wants_sitter FROM family_profiles WHERE user_id = ?').get(user.id)?.wants_sitter ?? null;
    return p;
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
  /** What a member still needs before others see them in Discover and before they can like: a photo and a few words. */
  const profileGaps = (user) => {
    if (!['aupair', 'family'].includes(user.role)) return [];
    const bio = db.prepare(`SELECT bio FROM ${user.role === 'aupair' ? 'aupair_profiles' : 'family_profiles'} WHERE user_id = ?`).get(user.id)?.bio;
    return [...(photosOf(user).length ? [] : ['photo']), ...(String(bio ?? '').trim() ? [] : ['bio'])];
  };
  /** Liking and contacting someone need a confirmed email and a profile they can like back. */
  const mustBeReady = (user) => {
    mustBeVerified(user);
    if (profileGaps(user).length) throw new HttpError(403, 'Add a photo and a few words about you first, so they can like you back.', 'profile_incomplete');
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
    // Partner agencies tag their au pairs but earn nothing; flyer distributors are paid per flyer instead.
    if (!a?.active || a.kind !== 'ambassador' || a.user_id === u.id || u.suspended) return;
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
  /** What a partner agency's code brought in, for one month (YYYY-MM, by when the au pair joined) or all time. */
  const agencyStats = (a, month = null) => {
    const when = month ? " AND strftime('%Y-%m', u.created_at) = ?" : '';
    const r = db.prepare(`SELECT COUNT(*) aupairs,
        SUM((json_array_length(coalesce(u.photos, '[]')) > 0 OR u.photo_url IS NOT NULL) AND trim(coalesce(p.bio, '')) <> '') profiles,
        SUM(u.id_verified) verified,
        SUM(EXISTS (SELECT 1 FROM placements pl WHERE pl.aupair_id = u.id AND pl.status IN ('confirmed', 'active', 'completed'))) placements
      FROM users u LEFT JOIN aupair_profiles p ON p.user_id = u.id WHERE u.ref_code = ? AND u.role = 'aupair' AND u.id IS NOT ?${when}`)
      .get(a.code, a.user_id, ...(month ? [month] : []));
    return { aupairs: r.aupairs || 0, profiles: r.profiles || 0, verified: r.verified || 0, placements: r.placements || 0 };
  };
  // ---------- flyer distributors ----------
  // Someone who delivers flyers to mailboxes, under the ambassador umbrella but paid differently: the admin logs each
  // delivery session (area, flyers, date), which earns flyer_rate per flyer, and every family who joins through one of
  // that distributor's areas within bonus_days of a session there earns family_bonus on its own. Amounts are in öre.
  const areasOf = (a) => (Array.isArray(a.areas) ? a.areas : json.parse(a.areas, []));
  /** Records the family bonuses a distributor's sessions have brought in so far. Safe to run any time: each family's
   *  email counts once, the first time it shows up on the waitlist or as a family account. */
  const syncFlyerBonuses = (a) => {
    if (a.kind !== 'distributor' || !a.active) return;
    const families = db.prepare(`INSERT OR IGNORE INTO flyer_bonuses (ambassador_id, session_id, email, area, amount_ore, joined_at)
      SELECT ?, ?, email, ?, ?, MIN(created_at) FROM (
        SELECT lower(trim(email)) email, source, created_at FROM waitlist WHERE coalesce(role, '') <> 'aupair'
        UNION ALL SELECT lower(trim(email)), source, created_at FROM users WHERE role = 'family' AND NOT suspended)
      WHERE source = ? AND created_at >= ? AND created_at < datetime(?, ?) GROUP BY email`);
    const areas = areasOf(a);
    for (const s of db.prepare('SELECT * FROM flyer_sessions WHERE ambassador_id = ? ORDER BY delivered_on, id').all(a.id)) {
      if (areas.includes(s.area)) families.run(a.id, s.id, s.area, a.family_bonus, s.area, s.delivered_on, s.delivered_on, `+${a.bonus_days} days`);
    }
  };
  /** A distributor's sessions, flyers, families and pay, for one month (YYYY-MM) or all time. owed_ore is everything not paid yet. */
  const distributorStats = (a, month = null) => {
    syncFlyerBonuses(a);
    const s = db.prepare(`SELECT COUNT(*) sessions, COALESCE(SUM(flyers), 0) flyers, COALESCE(SUM(amount_ore), 0) n FROM flyer_sessions
      WHERE ambassador_id = ?${month ? " AND substr(delivered_on, 1, 7) = ?" : ''}`).get(a.id, ...(month ? [month] : []));
    const b = db.prepare(`SELECT COUNT(*) families, COALESCE(SUM(amount_ore), 0) n FROM flyer_bonuses
      WHERE ambassador_id = ?${month ? " AND strftime('%Y-%m', joined_at) = ?" : ''}`).get(a.id, ...(month ? [month] : []));
    const owed = (t) => db.prepare(`SELECT COALESCE(SUM(amount_ore), 0) n FROM ${t} WHERE ambassador_id = ? AND paid_at IS NULL`).get(a.id).n;
    return { sessions: s.sessions, flyers: s.flyers, families: b.families, flyers_ore: s.n, bonus_ore: b.n, earned_ore: s.n + b.n,
      owed_ore: owed('flyer_sessions') + owed('flyer_bonuses') };
  };
  /** A distributor's sessions, newest first, each with how many families it brought in. */
  const flyerSessions = (a) => db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM flyer_bonuses b WHERE b.session_id = s.id) families
    FROM flyer_sessions s WHERE s.ambassador_id = ? ORDER BY s.delivered_on DESC, s.id DESC LIMIT 500`).all(a.id);
  const statsOf = (a, month) => (a.kind === 'distributor' ? distributorStats(a, month) : ambassadorStats(a, month));

  const adminAmbassador = (id, month = null, detail = true) => {
    const a = db.prepare('SELECT a.*, COALESCE(u.email, a.invite_email) account_email FROM ambassadors a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?').get(Number(id));
    if (!a) throw notFound();
    return {
      ...a, active: !!a.active, link: referralLink(a), areas: areasOf(a), stats: statsOf(a, month),
      gifts: db.prepare('SELECT COUNT(*) saved, COUNT(redeemed_at) redeemed FROM ref_gifts WHERE ambassador_id = ?').get(a.id),
      ...(detail ? {
        referrals: db.prepare('SELECT id, name, role, country, created_at, suspended FROM users WHERE ref_code = ? ORDER BY created_at DESC, id DESC LIMIT 500').all(a.code),
        rewards: db.prepare('SELECT r.*, u.name user_name FROM referral_rewards r LEFT JOIN users u ON u.id = r.user_id WHERE r.ambassador_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 500').all(a.id),
        ...(a.kind === 'distributor' ? {
          sessions: flyerSessions(a),
          bonuses: db.prepare(`SELECT b.*, u.id user_id, u.name user_name FROM flyer_bonuses b LEFT JOIN users u ON lower(trim(u.email)) = b.email
            WHERE b.ambassador_id = ? ORDER BY b.joined_at DESC, b.id DESC LIMIT 500`).all(a.id),
        } : {}),
      } : {}),
    };
  };

  // The website and app show who invited someone, so they can tell the code is right.
  api.get('/referral/:code', authLimit, wrap((req) => {
    const a = ambassadorByCode(referralCode(req.params.code));
    if (!a) throw notFound('That referral code is not valid. Check it, or leave it empty.');
    // An agency is known by its full name; an ambassador by their first name.
    return { code: a.code, name: a.kind === 'agency' ? a.name : a.name.split(/\s+/)[0], kind: a.kind };
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
    // A family on the waitlist before launch keeps an early family bonus spot for when they sign up.
    const early = added && role === 'family' && claimEarlyBonus(email);
    if (added) {
      // The sign-up page for their role (au pair or family), with their email filled in.
      const signup = `${publicBase()}/#/register?${role ? `role=${role}&` : ''}email=${encodeURIComponent(email)}`;
      const { subject, text } = waitlistEmail(lang, `${publicBase()}/api/waitlist/leave?t=${token}`, early ? earlyDays() : 0, signup);
      try { await mailer({ to: email, subject, text }); } catch (e) { console.error('Waitlist email failed:', e.message); }
    }
    return { ok: true };
  }));
  api.get('/waitlist/leave', wrap((req, res) => {
    const w = db.prepare('SELECT email FROM waitlist WHERE token = ?').get(String(req.query.t || ''));
    const gone = w ? db.prepare('DELETE FROM waitlist WHERE email = ?').run(w.email).changes : 0;
    // Leaving the list frees an early family bonus spot that no account has taken up yet.
    if (w) db.prepare('DELETE FROM early_bonus WHERE email = ? AND user_id IS NULL AND redeemed_at IS NULL').run(w.email);
    const lang = pickLang(req.get('accept-language')) || 'en';
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/legal.css"><main><h1>PairMundo</h1><p>${
      translate(lang, gone ? "You're off the list. We won't email you about the launch." : 'This link was already used, or the address is not on the list.')}</p><p><a href="/">pairmundo.com</a></p></main>`);
  }));

  /**
   * Makes a member account and what comes with it: an empty profile, and for families the trial, early bonus and
   * ambassador gift days. verified is set when the person already proved the email (a reference link they opened).
   */
  const createMember = ({ email, password, role, name, country, city, lang, source, ambassador, verified = false }) => {
    const partner = role === 'agency' || role === 'ambassador';
    const user = tx(db, () => {
      const r = db.prepare('INSERT INTO users (email, password_hash, role, name, country, city, lang, source, ref_code, email_verified) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(email, hashPassword(String(password)), role, str(name, 120), str(country, 2)?.toUpperCase() ?? null, str(city, 120), lang,
          source, ambassador?.code ?? null, verified ? 1 : 0);
      const id = Number(r.lastInsertRowid);
      if (!partner) db.prepare(`INSERT INTO ${role === 'aupair' ? 'aupair_profiles' : 'family_profiles'} (user_id) VALUES (?)`).run(id);
      return getUser(id);
    });
    // The admin links a new agency or ambassador account to its code, unless it was invited to one.
    if (partner && !db.prepare('SELECT 1 FROM ambassadors WHERE user_id IS NULL AND invite_email = ?').get(email)) {
      const text = role === 'agency' ? 'New agency account: {name}. Link it to a code under Ambassadors.' : 'New ambassador account: {name}. Link it to a code under Ambassadors.';
      for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin'").all()) notify(a.id, role, text, { name: user.name }, '#/admin/ambassadors');
    }
    // New families can get a free trial of the Family Pass (FAMILY_TRIAL_DAYS, off unless set).
    if (role === 'family' && trialDays()) grantPass(user.id, 'trial', `signup-${user.id}`, trialDays(), { quiet: true });
    // Families who sign up before launch (or kept a spot from the waitlist) get the early family bonus, while spots last.
    if (role === 'family') claimEarlyBonus(email, user.id);
    // A family who came with an ambassador's code that gives gift days gets them saved, unless they have the early bonus.
    if (role === 'family') claimGift(email, user.id, ambassador);
    return user;
  };

  api.post('/auth/register', authLimit, wrap((req, res) => {
    const { password, role, name, country, city } = req.body || {};
    const email = normEmail(req.body?.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email.');
    if (!password || String(password).length < 8) throw bad('Password must be at least 8 characters.');
    // A partner agency, or an ambassador who is neither an au pair nor a family, signs up for an account with no
    // profile; PairMundo then links it to their code.
    if (!['aupair', 'family', 'agency', 'ambassador'].includes(role)) throw bad('Choose au pair or host family.');
    const partner = role === 'agency' || role === 'ambassador';
    if (!str(name)) throw bad('Name is required.');
    // An ambassador's referral code, typed in or carried over from their link.
    let ambassador = str(req.body?.ref_code) && !partner ? ambassadorByCode(referralCode(req.body.ref_code)) : null;
    if (str(req.body?.ref_code) && !partner && !ambassador) throw bad('That referral code is not valid. Check it, or leave it empty.');
    // Someone who joined the waitlist from an ambassador's link or a flyer and signs up later in the app keeps
    // that ambassador and source, so a referral made before launch still counts.
    const waited = db.prepare('SELECT source, ref_code FROM waitlist WHERE email = ?').get(email);
    if (!partner) ambassador ??= ambassadorByCode(waited?.ref_code);
    const source = str(req.body?.source, 60)?.toLowerCase() ?? waited?.source ?? null;
    if (db.prepare('SELECT 1 FROM users WHERE lower(trim(email)) = ?').get(email)) throw new HttpError(409, 'An account with this email already exists.');
    const user = createMember({ email, password, role, name, country, city, lang: pickLang(req.get('accept-language')), source, ambassador });
    issueCode(user, 'verify');
    const s = createSession(db, user.id);
    setCookie(res, s.token);
    res.status(201);
    return { user: { ...publicUser(user, user), email: user.email, email_verified: false }, token: s.token };
  }));

  api.post('/auth/login', authLimit, wrap((req, res) => {
    const { email, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE lower(trim(email)) = ?').get(normEmail(email));
    if (!user || !verifyPassword(String(password || ''), user.password_hash)) throw new HttpError(401, 'Wrong email or password.');
    if (user.suspended) throw forbidden('This account is suspended. Contact support.');
    const s = createSession(db, user.id);
    setCookie(res, s.token);
    return { user: { ...publicUser(user, user), email: user.email, email_verified: !!user.email_verified }, token: s.token };
  }));

  api.post('/auth/verify-email', requireAuth, authLimit, wrap((req) => {
    if (req.user.email_verified) return { ok: true };
    useCode(req.user.id, 'verify', req.body?.code);
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(req.user.id);
    checkProfileReward(req.user.id);
    claimInvite(req.user);
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
    claimInvite(user);
    const s = createSession(db, user.id);
    setCookie(res, s.token);
    return { user: { ...publicUser(user, user), email: user.email, email_verified: true }, token: s.token };
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
      user: { ...publicUser(u, u), email: u.email, email_verified: !!u.email_verified },
      profile: ownProfile(u),
      profile_missing: profileGaps(u),
      pass: passView(u),
      rating: ratingSummary(u.id),
      ambassador: db.prepare('SELECT code, kind FROM ambassadors WHERE user_id = ? AND active = 1').get(u.id) ?? null,
      // Whether they joined with a referral or agency code (an au pair without one can still add their agency's).
      has_code: !!u.ref_code,
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
      if (u.role === 'family' && 'wants_sitter' in p) {
        if (p.wants_sitter !== null && !SITTER_ANSWERS.includes(p.wants_sitter)) throw bad('Answer yes, maybe or no.');
        db.prepare('UPDATE family_profiles SET wants_sitter = ? WHERE user_id = ?').run(p.wants_sitter, u.id);
      }
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
        const oldCerts = table === 'aupair_profiles' && sets.includes('certificates')
          ? json.parse(db.prepare('SELECT certificates FROM aupair_profiles WHERE user_id = ?').get(u.id)?.certificates) : null;
        db.prepare(`UPDATE ${table} SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...vals, u.id);
        // A checked certificate stays checked only while it says the same thing.
        if (oldCerts) {
          const now = json.parse(vals[sets.indexOf('certificates')]);
          for (const c of oldCerts) {
            const same = now.find((n) => n.kind === c.kind);
            if (!same || (same.detail || null) !== (c.detail || null)) db.prepare('DELETE FROM certificate_proofs WHERE user_id = ? AND kind = ?').run(u.id, c.kind);
          }
        }
      }
    });
    checkProfileReward(u.id);
    const fresh = getUser(u.id);
    return { user: publicUser(fresh, fresh), profile: ownProfile(fresh) };
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
      // A used early family bonus stays recorded by email, so a new account can't get it again.
      db.prepare('DELETE FROM early_bonus WHERE user_id = ? AND redeemed_at IS NULL').run(u.id);
      db.prepare('DELETE FROM ref_gifts WHERE user_id = ? AND redeemed_at IS NULL').run(u.id);
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
      .map((r) => ({ ...r, reviewer_name: shortName(r.reviewer_name), criteria: json.parse(r.criteria, {}) }));
    const me = req.user;
    let match = null; let visa = null;
    if (me.role !== u.role && me.role !== 'admin') {
      const [ap, fam] = me.role === 'aupair' ? [me, u] : [u, me];
      const apProfile = getProfile(ap); const famProfile = getProfile(fam); const program = getProgram(fam.country);
      match = scoreMatch({ user: ap, profile: apProfile }, { user: fam, profile: famProfile }, program, ratingSummary(ap.id), req.user.lang);
      // What the visa takes, before anyone matches or pays. Where only an agency can sponsor it, the partner agencies for that country.
      visa = visaRoute(program, apProfile?.nationality, famProfile?.start_date);
      if (visa?.kind === 'sponsor') visa.agencies = referralAgencies(fam.country, me.role);
    }
    const req_ = db.prepare(`SELECT id, from_user, status FROM match_requests WHERE
        ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)) ORDER BY id DESC LIMIT 1`).get(me.id, u.id, u.id, me.id);
    return {
      user: publicUser(u, me),
      profile: getProfile(u),
      rating: ratingSummary(u.id),
      reviews,
      references: u.role === 'aupair' ? confirmedReferences(u.id) : [],
      placements_completed: db.prepare(`SELECT COUNT(*) n FROM placements WHERE status = 'completed' AND (aupair_id = ? OR family_id = ?)`).get(u.id, u.id).n,
      match,
      visa,
      // Who liked you is part of the Family Pass.
      request: req_ && !(req_.status === 'pending' && req_.from_user === u.id && needsPass(me)) ? req_ : null,
      favorite: !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND target_id = ?').get(me.id, u.id),
      blocked: iBlocked,
    };
  }));

  // ---------- references ----------
  // An au pair enters the email of a family they looked after children for. PairMundo emails the family a link; the
  // family makes a free account with that email (opening the link proves it) and answers a short form, so every review
  // comes from a real, signed-in person and the family is on PairMundo afterwards. These past-family references are
  // separate from placement reviews, which only the two sides of a PairMundo placement can leave.
  // A confirmed reference turns on the "References" badge.
  const MAX_REFERENCES = 5;
  const refAnswers = (r) => json.parse(r.answers, null);
  const firstName = (name) => String(name || '').split(/\s+/)[0];
  const myReference = (r) => ({ id: r.id, name: r.name, email: r.email, relation: r.relation, status: r.status, created_at: r.created_at, responded_at: r.responded_at });
  // verified: answered from a PairMundo account on the invited email. References answered before accounts were needed show without it.
  const shownReference = (r) => ({ id: r.id, name: firstName(r.reviewer_name || r.name), relation: r.relation, responded_at: r.responded_at,
    verified: !!r.reviewer_id, ...refAnswers(r) });
  const confirmedReferences = (userId) => db.prepare(`SELECT rc.*, ru.name reviewer_name FROM reference_checks rc LEFT JOIN users ru ON ru.id = rc.reviewer_id
      WHERE rc.user_id = ? AND rc.status = 'confirmed' ORDER BY rc.responded_at DESC`).all(userId).map(shownReference);
  const accountFor = (email) => db.prepare('SELECT * FROM users WHERE lower(trim(email)) = ?').get(normEmail(email));

  api.get('/me/references', requireRole('aupair'), wrap((req) => ({
    references: db.prepare('SELECT * FROM reference_checks WHERE user_id = ? ORDER BY id DESC').all(req.user.id).map(myReference),
  })));
  api.post('/me/references', requireRole('aupair'), authLimit, wrap(async (req) => {
    const u = req.user;
    // Only the email is needed; the family gives their name when they make their account.
    const name = str(req.body?.name, 80) ?? '';
    const email = normEmail(req.body?.email);
    const relation = str(req.body?.relation, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw bad('Enter a valid email.');
    if (email === normEmail(u.email)) throw bad('A reference has to be someone else.');
    if (db.prepare("SELECT 1 FROM reference_checks WHERE user_id = ? AND email = ? AND status != 'declined'").get(u.id, email)) throw bad('You already asked this person.');
    if (db.prepare("SELECT COUNT(*) n FROM reference_checks WHERE user_id = ? AND status != 'declined'").get(u.id).n >= MAX_REFERENCES) throw bad('You can have up to 5 references.');
    const token = randomBytes(18).toString('base64url');
    const id = Number(db.prepare('INSERT INTO reference_checks (user_id, name, email, relation, token) VALUES (?,?,?,?,?)').run(u.id, name, email, relation, token).lastInsertRowid);
    const { subject, text } = referenceEmail(u.lang, { aupair: u.name, link: `${publicBase()}/#/reference/${token}` });
    try { await mailer({ to: email, subject, text }); } catch (e) { console.error('Reference email failed:', e.message); }
    return { reference: myReference(db.prepare('SELECT * FROM reference_checks WHERE id = ?').get(id)) };
  }));
  api.delete('/me/references/:id', requireRole('aupair'), wrap((req) => {
    db.prepare('DELETE FROM reference_checks WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    const left = db.prepare("SELECT COUNT(*) n FROM reference_checks WHERE user_id = ? AND status = 'confirmed'").get(req.user.id).n;
    if (!left) db.prepare('UPDATE users SET references_checked = 0 WHERE id = ?').run(req.user.id);
    return { ok: true };
  }));
  // The page the family opens from their email. The link is the key to the invitation and proves they get mail at
  // that address; answering takes an account on the same email.
  const referenceByToken = (token) => {
    const r = db.prepare('SELECT * FROM reference_checks WHERE token = ?').get(String(token || ''));
    if (!r) throw notFound('This link is not valid any more.');
    return r;
  };
  const isInvited = (user, r) => !!user && normEmail(user.email) === r.email;
  api.get('/references/:token', wrap((req) => {
    const r = referenceByToken(req.params.token);
    const u = getUser(r.user_id);
    return { aupair: { name: u.name, first_name: firstName(u.name), photo_url: photosOf(u)[0] || null }, name: r.name, relation: r.relation, status: r.status,
      email: r.email, has_account: !!accountFor(r.email), signed_in: isInvited(req.user, r) };
  }));
  // A family without an account makes one here: a host family account on the invited email, already confirmed.
  // It happens before the questions, so a family who stops halfway still has their account.
  api.post('/references/:token/account', authLimit, wrap((req, res) => {
    const r = referenceByToken(req.params.token);
    if (r.status !== 'sent') throw new HttpError(409, 'You already answered. Thank you!');
    const { password, name, country } = req.body || {};
    if (!str(name)) throw bad('Name is required.');
    if (!password || String(password).length < 8) throw bad('Password must be at least 8 characters.');
    if (accountFor(r.email)) throw new HttpError(409, 'You already have a PairMundo account. Sign in to leave your review.');
    const waited = db.prepare('SELECT ref_code FROM waitlist WHERE email = ?').get(r.email);
    const user = createMember({ email: r.email, password, role: 'family', name, country, lang: pickLang(req.get('accept-language')),
      source: 'reference', ambassador: ambassadorByCode(waited?.ref_code), verified: true });
    claimInvite(user);
    const s = createSession(db, user.id);
    setCookie(res, s.token);
    res.status(201);
    return { user: { ...publicUser(user, user), email: user.email, email_verified: true }, token: s.token };
  }));
  api.post('/references/:token', authLimit, wrap((req) => {
    const r = referenceByToken(req.params.token);
    if (r.status !== 'sent') throw new HttpError(409, 'You already answered. Thank you!');
    const b = req.body || {};
    if (b.knows === false) {
      db.prepare("UPDATE reference_checks SET status = 'declined', responded_at = datetime('now') WHERE id = ?").run(r.id);
      return { ok: true, status: 'declined' };
    }
    if (!req.user) throw new HttpError(401, 'Make your free account or sign in to send your review.');
    if (!isInvited(req.user, r)) throw forbidden('Sign in with the email this invitation was sent to.');
    const months = Math.round(Number(b.months));
    const rating = Math.round(Number(b.rating));
    if (!(months >= 1 && months <= 240)) throw bad('Say for how many months.');
    if (!(rating >= 1 && rating <= 5)) throw bad('Choose a rating from 1 to 5.');
    if (typeof b.recommend !== 'boolean') throw bad('Say whether you would recommend them.');
    const answers = { months, rating, recommend: b.recommend, comment: str(b.comment, 600) || null,
      age_groups: (Array.isArray(b.age_groups) ? b.age_groups : []).filter((g) => ['infant', 'toddler', 'school', 'teen'].includes(g)) };
    tx(db, () => {
      db.prepare(`UPDATE reference_checks SET status = 'confirmed', answers = ?, reviewer_id = ?, name = CASE WHEN name = '' THEN ? ELSE name END,
          responded_at = datetime('now') WHERE id = ?`).run(json.str(answers), req.user.id, req.user.name, r.id);
      db.prepare('UPDATE users SET references_checked = 1 WHERE id = ?').run(r.user_id);
      // Opening the emailed link proves the address, like a code would.
      if (!req.user.email_verified) db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(req.user.id);
    });
    notify(r.user_id, 'verification', '{name} confirmed your reference. Families can now see it on your profile.', { name: firstName(req.user.name) }, '#/profile');
    return { ok: true, status: 'confirmed' };
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
      .all(req.user.id).map((u) => publicUser(u, req.user)),
  })));

  // ---------- certificate checks ----------
  // An au pair sends a photo or PDF of a certificate; an admin compares it with what the profile says and marks it
  // checked or not. The file is only for that check, so it is deleted as soon as an admin decides.
  const PROOF_TYPES = { 'image/jpeg': 'ffd8ff', 'image/png': '89504e47', 'image/webp': '52494646', 'application/pdf': '25504446' };
  api.get('/me/certificates', requireRole('aupair'), wrap((req) => ({
    proofs: db.prepare('SELECT kind, status, note, created_at, reviewed_at FROM certificate_proofs WHERE user_id = ?').all(req.user.id),
  })));
  api.post('/me/certificates/:kind/proof', requireRole('aupair'), wrap((req) => {
    const kind = String(req.params.kind);
    const certs = json.parse(db.prepare('SELECT certificates FROM aupair_profiles WHERE user_id = ?').get(req.user.id)?.certificates);
    if (!certs.some((c) => c.kind === kind)) throw bad('Add this certificate to your profile and save it first.');
    const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data_url || ''));
    if (!m) throw bad('Upload a photo (JPEG, PNG or WebP) or a PDF.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_PHOTO_BYTES) throw bad('Files must be under 5 MB.');
    const real = Object.entries(PROOF_TYPES).find(([, sig]) => buf.subarray(0, 4).toString('hex').startsWith(sig.slice(0, 8)))?.[0];
    if (!real || (real === 'image/webp' && buf.subarray(8, 12).toString() !== 'WEBP')) throw bad('That file is not a valid image or PDF.');
    db.prepare(`INSERT INTO certificate_proofs (user_id, kind, mime, data, status) VALUES (?,?,?,?,'pending')
      ON CONFLICT(user_id, kind) DO UPDATE SET mime = excluded.mime, data = excluded.data, status = 'pending', note = NULL, created_at = datetime('now'), reviewed_at = NULL`)
      .run(req.user.id, kind, real, buf);
    return { proof: db.prepare('SELECT kind, status, note, created_at FROM certificate_proofs WHERE user_id = ? AND kind = ?').get(req.user.id, kind) };
  }));
  api.get('/admin/certificates', requireRole('admin'), wrap(() => ({
    proofs: db.prepare(`SELECT c.user_id, c.kind, c.mime, c.status, c.created_at, u.name, u.email, p.certificates FROM certificate_proofs c
        JOIN users u ON u.id = c.user_id JOIN aupair_profiles p ON p.user_id = c.user_id WHERE c.status = 'pending' ORDER BY c.created_at`).all()
      .map(({ certificates, ...r }) => ({ ...r, detail: json.parse(certificates).find((x) => x.kind === r.kind)?.detail || null })),
  })));
  api.get('/admin/certificates/:userId/:kind/file', requireRole('admin'), (req, res) => {
    const r = db.prepare('SELECT mime, data FROM certificate_proofs WHERE user_id = ? AND kind = ?').get(Number(req.params.userId), String(req.params.kind));
    if (!r?.data) return res.status(404).json({ error: 'Not found.' });
    res.set({ 'Content-Type': r.mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' }).send(Buffer.from(r.data));
  });
  api.post('/admin/certificates/:userId/:kind', requireRole('admin'), wrap((req) => {
    const status = req.body?.status;
    if (!['verified', 'rejected'].includes(status)) throw bad('Choose verified or rejected.');
    const userId = Number(req.params.userId);
    const kind = String(req.params.kind);
    const done = db.prepare(`UPDATE certificate_proofs SET status = ?, note = ?, data = NULL, mime = NULL, reviewed_at = datetime('now')
      WHERE user_id = ? AND kind = ? AND status = 'pending'`).run(status, str(req.body?.note, 300), userId, kind).changes;
    if (!done) throw notFound();
    if (status === 'verified') notify(userId, 'verification', 'PairMundo checked one of your certificates. It now shows a ✔ on your profile.', {}, '#/profile');
    else notify(userId, 'verification', "We couldn't confirm one of your certificates. Open your profile to see why and send a clearer copy.", {}, '#/profile');
    return { ok: true };
  }));

  // ---------- search & matching ----------
  const findCandidates = (me, q, discover = false) => {
    const myProfile = getProfile(me);
    const lockLikes = needsPass(me);
    const targetRole = me.role === 'family' ? 'aupair' : 'family';
    const table = targetRole === 'aupair' ? 'aupair_profiles' : 'family_profiles';
    // Profiles without a photo or a description stay out of other people's results until they add them.
    const where = ['u.role = ?', 'u.suspended = 0', 'p.visible = 1', notBlocked('u.id'),
      "(json_array_length(coalesce(u.photos, '[]')) > 0 OR u.photo_url IS NOT NULL)", "trim(coalesce(p.bio, '')) <> ''"];
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
    // Names match from the start only, so a search can't confirm someone's hidden last name.
    if (q.q) { where.push('(u.name LIKE ? OR p.bio LIKE ? OR u.city LIKE ?)'); const like = `%${q.q}%`; params.push(`${q.q}%`, like, like); }
    const rows = db.prepare(`SELECT u.* FROM users u JOIN ${table} p ON p.user_id = u.id WHERE ${where.join(' AND ')}`).all(...params);

    let results = rows.map((u) => {
      const profile = getProfile(u);
      const rating = ratingSummary(u.id);
      const [ap, fam] = me.role === 'aupair'
        ? [{ user: me, profile: myProfile }, { user: u, profile }]
        : [{ user: u, profile }, { user: me, profile: myProfile }];
      const match = scoreMatch(ap, fam, getProgram(fam.user.country), ratingSummary(ap.user.id), me.lang);
      const likesYou = !!db.prepare("SELECT 1 FROM match_requests WHERE from_user = ? AND to_user = ? AND status = 'pending'").get(u.id, me.id);
      return { user: publicUser(u, me), profile, rating, match, likes_you: likesYou && !lockLikes };
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
    if (direction !== 'pass') mustBeReady(me);
    db.prepare('INSERT OR REPLACE INTO swipes (user_id, target_id, direction) VALUES (?,?,?)').run(me.id, t.id, direction);
    const theirs = db.prepare("SELECT * FROM match_requests WHERE from_user = ? AND to_user = ? AND status = 'pending'").get(t.id, me.id);
    if (direction === 'pass') {
      if (theirs) db.prepare("UPDATE match_requests SET status = 'declined', responded_at = datetime('now') WHERE id = ?").run(theirs.id);
      return { matched: false };
    }
    if (theirs) {
      const c = acceptRequest(theirs);
      notify(t.id, 'match', "It's a match! {name} liked you back.", { name: shortName(me.name) }, `#/messages/${c.id}`);
      return { matched: true, conversation_id: c.id, other: publicUser(t, me) };
    }
    const mine = db.prepare("SELECT id FROM match_requests WHERE from_user = ? AND to_user = ? AND status IN ('pending','accepted')").get(me.id, t.id);
    if (!mine) {
      db.prepare('INSERT INTO match_requests (from_user, to_user, message) VALUES (?, ?, ?)').run(me.id, t.id, str(message, 2000));
      notify(t.id, 'like', direction === 'super' ? '{name} super liked you! ⭐' : 'Someone new liked you. See who in Likes.', { name: shortName(me.name) }, '#/likes');
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
    return { user: publicUser(t, me) };
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
          user: publicUser(u, req.user), profile, rating: ratingSummary(u.id), match: scoreMatch(ap, fam, getProgram(fam.user.country), ratingSummary(ap.user.id), req.user.lang) };
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
    return { required: passRequired() && u.role === 'family', active: !!p, trial: p?.source === 'trial', early: p?.source === 'early', early_bonus: earlyView(u), gift_active: p?.source === 'gift', gift: giftView(u), ends_at: p?.ends_at ?? null, days: FAMILY_PASS.days, price: FAMILY_PASS.price, web_checkout: !!checkout, product_id: FAMILY_PASS.product_id,
      plans: PASS_PLANS.map(({ id, days, price, product_id, ios_product_id }) => ({ id, days, price, product_id, ios_product_id })), rematch: u.role === 'family' ? rematchView(u.id) : null };
  };
  // ---------- Rematch Guarantee ----------
  const openPlacementSql = "family_id = ? AND (status = 'confirmed' OR (status = 'active' AND date('now') < date(start_date, ?)))";
  /** The guarantee that still protects a family: one waiting for a placement, or one on a placement that can still end early. */
  const liveGuarantee = (userId) => db.prepare(`SELECT g.* FROM rematch_guarantees g LEFT JOIN placements p ON p.id = g.placement_id
      WHERE g.user_id = ? AND g.claimed_at IS NULL AND g.refunded_at IS NULL
        AND (g.placement_id IS NULL OR p.status = 'confirmed' OR (p.status = 'active' AND date('now') < date(p.start_date, ?)))
      ORDER BY g.id LIMIT 1`).get(userId, `+${REMATCH.cover_days} days`);
  /** Puts a family's waiting guarantee on their open placement that has no cover yet, if there is one. */
  const attachGuarantee = (userId) => {
    const g = db.prepare('SELECT id FROM rematch_guarantees WHERE user_id = ? AND placement_id IS NULL AND claimed_at IS NULL AND refunded_at IS NULL ORDER BY id LIMIT 1').get(userId);
    if (!g) return;
    const p = db.prepare(`SELECT id FROM placements WHERE ${openPlacementSql}
        AND id NOT IN (SELECT placement_id FROM rematch_guarantees WHERE placement_id IS NOT NULL) ORDER BY start_date LIMIT 1`).get(userId, `+${REMATCH.cover_days} days`);
    if (p) db.prepare('UPDATE rematch_guarantees SET placement_id = ? WHERE id = ?').run(p.id, g.id);
  };
  const rematchView = (userId) => {
    const g = liveGuarantee(userId);
    const claimed = db.prepare('SELECT claimed_at FROM rematch_guarantees WHERE user_id = ? AND claimed_at IS NOT NULL ORDER BY claimed_at DESC LIMIT 1').get(userId);
    return { price: REMATCH.price, product_id: REMATCH.product_id, pass_days: REMATCH.pass_days, cover_months: Math.round(REMATCH.cover_days / 30.5),
      active: !!g, placement_id: g?.placement_id ?? null, can_buy: !g, last_claimed_at: claimed?.claimed_at ?? null };
  };
  /** Records a bought guarantee. A purchase already counted (same source and ref) is ignored. */
  const grantRematch = (userId, source, ref = null) => {
    if (ref && db.prepare('SELECT 1 FROM rematch_guarantees WHERE source = ? AND ref = ?').get(source, ref)) return false;
    db.prepare('INSERT INTO rematch_guarantees (user_id, source, ref) VALUES (?,?,?)').run(userId, source, ref);
    attachGuarantee(userId);
    return true;
  };
  /** A covered placement ended early: the family gets their free pass, once. */
  const claimRematch = (p, from) => {
    if (!(from === 'confirmed' || (from === 'active' && db.prepare("SELECT date('now') < date(?, ?) ok").get(p.start_date, `+${REMATCH.cover_days} days`).ok))) return;
    const g = db.prepare('SELECT * FROM rematch_guarantees WHERE placement_id = ? AND claimed_at IS NULL AND refunded_at IS NULL').get(p.id);
    if (!g) return;
    db.prepare("UPDATE rematch_guarantees SET claimed_at = datetime('now') WHERE id = ?").run(g.id);
    grantPass(p.family_id, 'rematch', `rematch-${g.id}`, REMATCH.pass_days, { quiet: true });
    notify(p.family_id, 'pass', 'Your Rematch Guarantee gave you {days} free days of the Family Pass to find your next au pair.', { days: REMATCH.pass_days }, '#/discover');
  };
  /** Adds a pass, starting when the current one ends. A purchase already counted (same source and ref) is ignored. */
  const grantPass = (userId, source, ref = null, days = FAMILY_PASS.days, { quiet = false } = {}) => {
    if (ref && db.prepare('SELECT 1 FROM passes WHERE source = ? AND ref = ?').get(source, ref)) return false;
    const start = activePass(userId)?.ends_at ?? db.prepare("SELECT datetime('now') d").get().d;
    db.prepare("INSERT INTO passes (user_id, source, ref, starts_at, ends_at) VALUES (?,?,?,?, datetime(?, ?))").run(userId, source, ref, start, start, `+${Number(days)} days`);
    // A family's first paid pass earns their ambassador a reward. Trials, the early family bonus, gift days, free days
    // from an admin and a Rematch Guarantee pass don't count.
    const plan = !['trial', 'early', 'gift', 'admin', 'rematch'].includes(source) && passPlan('days', Number(days));
    if (plan) addReward(userId, 'pass', AMBASSADOR_REWARDS.pass, `First Family Pass (${plan.price})`);
    if (!quiet) notify(userId, 'pass', 'Your Family Pass is active. You can now message au pairs and see who liked you.', {}, '#/likes');
    return true;
  };
  // Early family bonus: on top of the free trial, the first EARLY_FAMILY_CAP families (500 unless set; 0 turns it off)
  // who sign up, or join the waitlist as a family, before LAUNCH_DATE get EARLY_FAMILY_DAYS (30) free days of the pass.
  // They choose when to use them, until 12 months after launch. Without LAUNCH_DATE it is still before launch.
  const EARLY_REDEEM_MONTHS = 12;
  const envInt = (name, fallback, max) => {
    const v = process.env[name]; if (v == null || v === '') return fallback;
    const n = Math.floor(Number(v)); return n >= 0 && n <= max ? n : fallback;
  };
  const earlyCap = () => envInt('EARLY_FAMILY_CAP', 500, 100000);
  const earlyDays = () => envInt('EARLY_FAMILY_DAYS', 30, 365);
  const launchDate = () => { const d = String(process.env.LAUNCH_DATE || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null; };
  const launched = () => !!launchDate() && Date.now() >= Date.parse(`${launchDate()}T00:00:00Z`);
  /** The moment the bonus can no longer be used: 12 months after launch, or null while there is no launch date. */
  const earlyEnds = () => { if (!launchDate()) return null; const d = new Date(`${launchDate()}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + EARLY_REDEEM_MONTHS); return d; };
  const earlyOffer = () => {
    const cap = earlyCap(), days = earlyDays();
    const taken = db.prepare('SELECT COUNT(*) n FROM early_bonus').get().n;
    return { open: cap > 0 && days > 0 && !launched() && taken < cap, days, cap, taken, spots_left: Math.max(0, cap - taken), launch_date: launchDate() };
  };
  /** Saves an early family bonus spot for this email while the offer is open. A spot already saved stays. */
  const claimEarlyBonus = (email, userId = null) => {
    if (db.prepare('SELECT 1 FROM early_bonus WHERE email = ?').get(email)) {
      if (userId) db.prepare('UPDATE early_bonus SET user_id = ? WHERE email = ? AND user_id IS NULL').run(userId, email);
      return true;
    }
    if (!earlyOffer().open) return false;
    db.prepare('INSERT INTO early_bonus (email, user_id) VALUES (?,?)').run(email, userId);
    return true;
  };
  // Families who signed up or joined the waitlist before the bonus existed count as early too, oldest first.
  {
    const o = earlyOffer();
    if (o.open) db.prepare(`INSERT OR IGNORE INTO early_bonus (email, user_id, created_at)
      SELECT email, MAX(user_id), MIN(created_at) c FROM (
        SELECT lower(trim(email)) email, id user_id, created_at FROM users WHERE role = 'family'
        UNION ALL SELECT email, NULL, created_at FROM waitlist WHERE role = 'family')
      WHERE email NOT IN (SELECT email FROM early_bonus) GROUP BY email ORDER BY c LIMIT ?`).run(o.spots_left);
  }
  const earlyBonusOf = (u) => (u.role !== 'family' ? null
    : db.prepare('SELECT * FROM early_bonus WHERE user_id = ? OR (user_id IS NULL AND email = ?) ORDER BY user_id IS NULL LIMIT 1').get(u.id, normEmail(u.email)));
  /** A family's early family bonus as the app shows it, or null if they don't have one. */
  const earlyView = (u) => {
    const b = earlyBonusOf(u);
    if (!b || !earlyDays()) return null;
    const ends = earlyEnds();
    const expired = !!ends && Date.now() >= ends.getTime();
    return { days: earlyDays(), redeemed: !!b.redeemed_at, redeemed_at: b.redeemed_at, use_by: ends ? new Date(ends.getTime() - 86400000).toISOString().slice(0, 10) : null,
      expired, can_redeem: !b.redeemed_at && !expired && passRequired() };
  };
  // How many spots are left, for the website and the waitlist.
  api.get('/early-family-offer', wrap(() => { const { open, days, cap, spots_left, launch_date } = earlyOffer(); return { open, days, cap, spots_left, launch_date }; }));
  // The family picks when to use their bonus. The days start now, or when the pass they have ends.
  api.post('/family-pass/early-bonus', requireAuth, wrap((req) => {
    const u = req.user;
    if (u.role !== 'family') throw forbidden('Only families need the Family Pass.');
    const b = earlyBonusOf(u);
    const v = earlyView(u);
    if (!b || !v) throw notFound('This account has no early family bonus.');
    if (b.redeemed_at) throw new HttpError(409, 'You have already used your early family bonus.');
    if (v.expired) throw new HttpError(410, 'The time to use the early family bonus has passed.');
    if (!passRequired()) throw new HttpError(409, 'Everything is free right now, so your free days stay saved for later.');
    tx(db, () => {
      db.prepare("UPDATE early_bonus SET redeemed_at = datetime('now'), user_id = ? WHERE email = ?").run(u.id, b.email);
      grantPass(u.id, 'early', `early-${u.id}`, v.days, { quiet: true });
    });
    return passView(u);
  }));
  // Gift days: an ambassador's code can come with free days of the pass (ambassadors.gift_days), say from a real estate
  // office to the families it sends. They are saved when the family signs up, and the family starts them whenever they
  // choose, within 12 months. A family with the early family bonus keeps just that, so nobody gets both.
  const GIFT_REDEEM_MONTHS = 12;
  /** Saves the gift from the code a family signed up with. One per email, and none on top of an early family bonus. */
  const claimGift = (email, userId, a) => {
    if (!a?.gift_days || db.prepare('SELECT 1 FROM early_bonus WHERE email = ?').get(email)) return false;
    return !!db.prepare('INSERT OR IGNORE INTO ref_gifts (email, user_id, ambassador_id, days) VALUES (?,?,?,?)').run(email, userId, a.id, a.gift_days).changes;
  };
  const giftOf = (u) => (u.role !== 'family' ? null
    : db.prepare(`SELECT g.*, a.name from_name FROM ref_gifts g LEFT JOIN ambassadors a ON a.id = g.ambassador_id
      WHERE g.user_id = ? OR (g.user_id IS NULL AND g.email = ?) ORDER BY g.user_id IS NULL LIMIT 1`).get(u.id, normEmail(u.email)));
  /** A family's gift as the app shows it, or null if they don't have one. */
  const giftView = (u) => {
    const g = giftOf(u);
    if (!g) return null;
    const ends = new Date(`${g.created_at.replace(' ', 'T')}Z`); ends.setUTCMonth(ends.getUTCMonth() + GIFT_REDEEM_MONTHS);
    const expired = Date.now() >= ends.getTime();
    return { days: g.days, from: g.from_name ?? 'PairMundo', redeemed: !!g.redeemed_at, redeemed_at: g.redeemed_at, use_by: new Date(ends.getTime() - 86400000).toISOString().slice(0, 10),
      expired, can_redeem: !g.redeemed_at && !expired && passRequired() };
  };
  // The family picks when to use their gift. The days start now, or when the pass they have ends.
  api.post('/family-pass/gift', requireAuth, wrap((req) => {
    const u = req.user;
    if (u.role !== 'family') throw forbidden('Only families need the Family Pass.');
    const g = giftOf(u);
    const v = giftView(u);
    if (!g || !v) throw notFound('This account has no gift of free days.');
    if (g.redeemed_at) throw new HttpError(409, 'You have already used your gift of free days.');
    if (v.expired) throw new HttpError(410, 'The time to use this gift of free days has passed.');
    if (!passRequired()) throw new HttpError(409, 'Everything is free right now, so your free days stay saved for later.');
    tx(db, () => {
      db.prepare("UPDATE ref_gifts SET redeemed_at = datetime('now'), user_id = ? WHERE email = ?").run(u.id, g.email);
      grantPass(u.id, 'gift', `gift-${u.id}`, g.days, { quiet: true });
    });
    return passView(u);
  }));
  // Reminders as a family's pass runs out: a few days before, on the last day, and once just after it ends.
  // Sent in the app, by push and by email. Renewing moves the end date, so the reminders start over for the new one.
  const PASS_REMINDERS = {
    soon: 'Your Family Pass ends in {days} days. Renew it to keep messaging au pairs.',
    last_day: 'Your Family Pass ends within 24 hours. Renew it to keep messaging au pairs.',
    ended: 'Your Family Pass has ended. Get a new one to keep messaging au pairs and see who liked you.',
    ended_early: 'Your Family Pass has ended. You still have {free} free days saved for signing up early. Use them whenever you are ready.',
    ended_gift: 'Your Family Pass has ended. You still have {free} free days saved, a gift from {from}. Use them whenever you are ready.',
  };
  const sendPassReminders = () => {
    if (!passRequired()) return 0;
    // Each family's last pass (later passes start when earlier ones end), from 2 days ago to 3 days ahead.
    const rows = db.prepare(`SELECT p.user_id, MAX(p.ends_at) ends_at FROM passes p JOIN users u ON u.id = p.user_id
      WHERE u.role = 'family' AND u.suspended = 0 GROUP BY p.user_id
      HAVING MAX(p.ends_at) > datetime('now', '-2 days') AND MAX(p.ends_at) <= datetime('now', '+3 days')`).all();
    let sent = 0;
    for (const r of rows) {
      const left = Date.parse(r.ends_at.replace(' ', 'T') + 'Z') - Date.now();
      const kind = left <= 0 ? 'ended' : left <= 86400000 ? 'last_day' : 'soon';
      if (!db.prepare('INSERT OR IGNORE INTO pass_reminders (user_id, ends_at, kind) VALUES (?,?,?)').run(r.user_id, r.ends_at, kind).changes) continue;
      const u = getUser(r.user_id);
      // A family who still has their early family bonus, or gift days, is reminded that they're there.
      const early = earlyView(u), gift = giftView(u);
      const message = kind !== 'ended' ? PASS_REMINDERS[kind] : early?.can_redeem ? PASS_REMINDERS.ended_early : gift?.can_redeem ? PASS_REMINDERS.ended_gift : PASS_REMINDERS.ended;
      const vars = { days: Math.ceil(left / 86400000), free: early?.can_redeem ? early.days : gift?.days, from: gift?.from };
      notify(r.user_id, 'pass', message, vars, '#/family-pass');
      const subject = translate(u.lang, message, vars);
      const text = `${subject}\n\n${translate(u.lang, 'Renew it in the app, or on the website: {link}', { link: `${publicBase()}/#/family-pass` })}`;
      Promise.resolve(mailer({ to: u.email, subject, text })).catch((e) => console.error('Pass reminder email failed:', e.message));
      sent++;
    }
    return sent;
  };
  app.sendPassReminders = sendPassReminders;

  // Families usually replace their au pair every 12 months, and finding the next one takes about 3 months.
  // So about 3 months before an au pair's stay ends, nudge the family to start looking again. A family with no
  // placement in the app gets the nudge about 9 months after their last pass ended, when they most likely found someone.
  const SEARCH_NUDGES = {
    placement: "{name}'s stay with you ends on {date}. Finding your next au pair usually takes about 3 months, so now is a good time to start looking.",
    pass: 'If your au pair year ends in the next few months, now is a good time to start looking for your next au pair. It usually takes about 3 months.',
  };
  const sendSearchNudges = () => {
    const due = [
      // Confirmed or running stays ending in 60 to 90 days, the family's latest one only.
      ...db.prepare(`SELECT p.family_id user_id, 'placement:' || p.id anchor, 'placement' kind, p.end_date, a.name FROM placements p
        JOIN users a ON a.id = p.aupair_id
        WHERE p.status IN ('confirmed', 'active') AND date(p.end_date) BETWEEN date('now', '+60 days') AND date('now', '+90 days')
          AND p.end_date = (SELECT MAX(end_date) FROM placements WHERE family_id = p.family_id AND status != 'cancelled')`).all(),
      // Families whose last pass ended 9 to 10 months ago, with no pass now and no stay in the app after it.
      ...db.prepare(`SELECT user_id, 'pass:' || ends_at anchor, 'pass' kind FROM (SELECT user_id, MAX(ends_at) ends_at FROM passes GROUP BY user_id) last
        WHERE ends_at BETWEEN datetime('now', '-300 days') AND datetime('now', '-270 days')
          AND NOT EXISTS (SELECT 1 FROM placements pl WHERE pl.family_id = last.user_id AND pl.status != 'cancelled' AND pl.end_date >= date(last.ends_at))`).all(),
    ];
    let sent = 0;
    for (const r of due) {
      const u = getUser(r.user_id);
      if (!u || u.role !== 'family' || u.suspended) continue;
      if (!db.prepare('INSERT OR IGNORE INTO search_nudges (user_id, anchor) VALUES (?,?)').run(r.user_id, r.anchor).changes) continue;
      let date = r.end_date;
      try { date = new Intl.DateTimeFormat(u.lang || 'en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${r.end_date}T00:00:00Z`)); } catch { /* keep YYYY-MM-DD */ }
      const vars = { name: String(r.name || '').split(/\s+/)[0], date };
      notify(r.user_id, 'search', SEARCH_NUDGES[r.kind], vars, '#/discover');
      const subject = translate(u.lang, 'Time to find your next au pair');
      const text = `${translate(u.lang, SEARCH_NUDGES[r.kind], vars)}\n\n${translate(u.lang, 'Start looking in the app, or on the website: {link}', { link: `${publicBase()}/#/discover` })}`;
      Promise.resolve(mailer({ to: u.email, subject, text })).catch((e) => console.error('Search nudge email failed:', e.message));
      sent++;
    }
    return sent;
  };
  app.sendSearchNudges = sendSearchNudges;

  // New accounts still missing a photo or bio can't be liked, so nudge them 2 days and 7 days after they sign up, in
  // the app, by push and by email. Only accounts from the last 30 days, so old accounts aren't suddenly emailed.
  const PROFILE_NUDGES = {
    family: 'Au pairs can only like families with a photo and a few words. Add yours to your profile; it takes about 5 minutes.',
    aupair: 'Families can only like au pairs with a photo and a few words. Add yours to your profile; it takes about 5 minutes.',
  };
  const sendProfileNudges = () => {
    const rows = db.prepare(`SELECT * FROM users WHERE role IN ('family', 'aupair') AND suspended = 0 AND email_verified = 1
      AND created_at <= datetime('now', '-2 days') AND created_at > datetime('now', '-30 days')`).all();
    let sent = 0;
    for (const u of rows) {
      if (!profileGaps(u).length) continue;
      const kind = Date.parse(u.created_at.replace(' ', 'T') + 'Z') <= Date.now() - 7 * 86400000 ? 'day7' : 'day2';
      // One nudge per kind; an account first seen after day 7 gets only the day-7 one.
      if (kind === 'day2' && db.prepare('SELECT 1 FROM profile_nudges WHERE user_id = ?').get(u.id)) continue;
      if (!db.prepare('INSERT OR IGNORE INTO profile_nudges (user_id, kind) VALUES (?,?)').run(u.id, kind).changes) continue;
      const message = PROFILE_NUDGES[u.role];
      notify(u.id, 'profile', message, {}, '#/profile');
      const subject = translate(u.lang, message);
      const text = `${subject}\n\n${translate(u.lang, 'Finish your profile here: {link}', { link: `${publicBase()}/#/profile` })}`;
      Promise.resolve(mailer({ to: u.email, subject, text })).catch((e) => console.error('Profile nudge email failed:', e.message));
      sent++;
    }
    return sent;
  };
  app.sendProfileNudges = sendProfileNudges;
  const mustHavePass = (u) => {
    if (needsPass(u)) throw new HttpError(402, 'Get the Family Pass to message au pairs.', 'pass_required');
  };
  api.get('/family-pass', requireAuth, wrap((req) => passView(req.user)));
  const publicBase = () => (process.env.PUBLIC_URL || 'https://pairmundo.com').replace(/\/$/, '');
  // Paying on the website goes through Stripe Checkout. The webhook grants the pass; the page also checks on return.
  api.post('/family-pass/checkout', requireAuth, wrap(async (req) => {
    if (!checkout) throw new HttpError(503, 'Payments are coming soon.');
    if (req.user.role !== 'family') throw forbidden('Only families need the Family Pass.');
    const plan = req.body?.plan === REMATCH.id ? REMATCH : passPlan('id', req.body?.plan) || FAMILY_PASS;
    if (plan === REMATCH && liveGuarantee(req.user.id)) throw new HttpError(409, 'You already have a Rematch Guarantee.');
    const s = await checkout.start(req.user, {
      amount: plan.amount, currency: plan.currency, name: plan.name, plan: plan.id,
      successUrl: `${publicBase()}/#/family-pass?paid={CHECKOUT_SESSION_ID}`, cancelUrl: `${publicBase()}/#/family-pass`,
    });
    return { url: s.url };
  }));
  /** A paid Stripe Checkout session: a pass of the plan bought, or a Rematch Guarantee. */
  const fulfilStripe = (userId, sessionId, planId) => (planId === REMATCH.id ? grantRematch(userId, 'stripe', sessionId)
    : grantPass(userId, 'stripe', sessionId, (passPlan('id', planId) || FAMILY_PASS).days));
  api.post('/family-pass/checkout/:id', requireAuth, wrap(async (req) => {
    if (!checkout) throw new HttpError(503, 'Payments are coming soon.');
    let r;
    try { r = await checkout.result(req.params.id); } catch { throw notFound(); }
    if (r.userId !== req.user.id) throw notFound();
    if (r.paid) fulfilStripe(req.user.id, req.params.id, r.plan);
    return { paid: r.paid, plan: r.plan, pass: passView(req.user) };
  }));
  // Apple and Google purchases, checked with RevenueCat. The app calls this after buying and for "Restore purchases";
  // RevenueCat's webhook below does the same thing in the background.
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
      if (p.product === REMATCH.product_id && (!p.purchasedAt || Date.parse(p.purchasedAt) > Date.now() - REMATCH.cover_days * 86400000) && grantRematch(req.user.id, p.store, p.ref)) added++;
    }
    return { added, pass: passView(req.user) };
  }));
  api.post('/revenuecat/webhook', wrap((req) => {
    if (!webhookAuthorized(req.get('authorization'))) throw new HttpError(401, 'Not allowed.');
    const e = req.body?.event || {};
    const u = getUser(Number(e.app_user_id));
    const plan = planFor(e.product_id);
    if (u?.role === 'family' && e.product_id === REMATCH.product_id && e.transaction_id) {
      const ref = String(e.transaction_id);
      if (e.type === 'NON_RENEWING_PURCHASE') grantRematch(u.id, storeName(e.store), ref);
      // A refunded guarantee stops covering; a free pass it already gave stays.
      if (e.type === 'CANCELLATION' || e.type === 'REFUND') db.prepare("UPDATE rematch_guarantees SET refunded_at = datetime('now') WHERE user_id = ? AND source = ? AND ref = ?").run(u.id, storeName(e.store), ref);
      return { received: true };
    }
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
    let s;
    try { s = await identity.start(req.user, req.body?.from === 'web' ? `${publicBase()}/#/account` : `${publicBase()}/id-check-done`); }
    catch (e) {
      // Usually Stripe Identity isn't activated on the Stripe account yet; Stripe's reason is in the server log.
      console.error('ID check start failed:', e.message);
      throw new HttpError(503, "The ID check isn't working right now. Please try again later.");
    }
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
      if (u) fulfilStripe(u.id, s.id, s.metadata.plan);
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
      .all(req.user.id).map((u) => ({ user: publicUser(u, req.user), rating: ratingSummary(u.id) })),
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
    mustBeReady(req.user);
    const open = db.prepare(`SELECT id FROM match_requests WHERE status IN ('pending','accepted')
        AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))`).get(req.user.id, to.id, to.id, req.user.id);
    if (open) throw new HttpError(409, 'You already have an open request with this person.');
    const r = db.prepare('INSERT INTO match_requests (from_user, to_user, message) VALUES (?, ?, ?)')
      .run(req.user.id, to.id, str(req.body?.message, 2000));
    notify(to.id, 'request', '{name} is interested in matching with you.', { name: shortName(req.user.name) }, '#/requests');
    res.status(201);
    return { id: Number(r.lastInsertRowid) };
  }));

  api.get('/requests', requireAuth, wrap((req) => {
    const rows = db.prepare(`SELECT r.*, fu.name from_name, fu.role from_role, fu.country from_country, fu.photo_url from_photo,
          tu.name to_name, tu.role to_role, tu.country to_country, tu.photo_url to_photo
        FROM match_requests r JOIN users fu ON fu.id = r.from_user JOIN users tu ON tu.id = r.to_user
        WHERE r.from_user = ? OR r.to_user = ? ORDER BY r.created_at DESC`).all(req.user.id, req.user.id)
      .map((r) => (r.from_user === req.user.id ? { ...r, to_name: shortName(r.to_name) } : { ...r, from_name: shortName(r.from_name) }));
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
      if (action === 'accept') mustBeReady(req.user);
      const status = action === 'accept' ? 'accepted' : 'declined';
      if (status === 'accepted') acceptRequest(r);
      else db.prepare("UPDATE match_requests SET status = 'declined', responded_at = datetime('now') WHERE id = ?").run(r.id);
      db.prepare('INSERT OR REPLACE INTO swipes (user_id, target_id, direction) VALUES (?,?,?)').run(me, r.from_user, status === 'accepted' ? 'like' : 'pass');
      if (status === 'accepted') notify(r.from_user, 'match', "It's a match! {name} liked you back.", { name: shortName(req.user.name) }, '#/matches');
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
        .all(me, me, me, me).filter((c) => !blockedBetween(me, c.other_id)).map((c) => ({ ...c, other: publicUser(getUser(c.other_id), req.user) })),
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
      other: publicUser(getUser(otherId), req.user),
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
    push(c.user_a === req.user.id ? c.user_b : c.user_a, body.length > 140 ? `${body.slice(0, 139)}…` : body, `#/messages/${c.id}`, shortName(req.user.name));
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
    push(other.id, translate(other.lang, '{name} started a video call. Tap to join.', { name: shortName(req.user.name) }), `#/messages/${c.id}`, shortName(req.user.name));
    res.status(201);
    return db.prepare(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`).get(Number(r.lastInsertRowid));
  }));
  api.post('/conversations/:id/calls/:messageId/join', requireAuth, wrap(async (req) => {
    const c = myConversation(req);
    const m = db.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND call_url IS NOT NULL').get(Number(req.params.messageId), c.id);
    if (!m) throw notFound();
    if (openCall(c)?.id !== m.id) throw new HttpError(410, 'This call has ended. Start a new one.');
    const url = await video.joinUrl(m.call_url, shortName(req.user.name));
    // Private Daily rooms open inside the phone app. Jitsi rooms open in the browser, since Jitsi's sign-in doesn't work inside an app.
    return { url, in_app: /^https:\/\/[^/]+\.daily\.co\//.test(url) };
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
      const ins = db.prepare('INSERT INTO placement_tasks (placement_id, title, owner, due_date, sort, link) VALUES (?,?,?,?,?,?)');
      placementTaskList(program, getProfile(ap)?.nationality, b.start_date, b.end_date).forEach((t, i) => ins.run(pid, t.title, t.owner, t.due_date, i, t.link));
      return pid;
    });
    notify(other.id, 'placement', '{name} proposed a placement. Review and confirm it.', { name: shortName(req.user.name) }, `#/placements/${id}`);
    res.status(201);
    return { id, compliance };
  }));

  const loadPlacement = (req) => {
    const p = db.prepare('SELECT * FROM placements WHERE id = ?').get(Number(req.params.id));
    if (!p || (req.user.role !== 'admin' && p.aupair_id !== req.user.id && p.family_id !== req.user.id)) throw notFound();
    return p;
  };
  const rematchCover = (placementId) => {
    const g = db.prepare('SELECT claimed_at FROM rematch_guarantees WHERE placement_id = ? AND refunded_at IS NULL').get(placementId);
    return { covered: !!g, claimed: !!g?.claimed_at };
  };
  const placementView = (p, me) => {
    const ap = getUser(p.aupair_id); const fam = getUser(p.family_id);
    const program = getProgram(p.country);
    const myReview = db.prepare('SELECT * FROM reviews WHERE placement_id = ? AND reviewer_id = ?').get(p.id, me.id);
    return {
      ...p,
      aupair: publicUser(ap, me), family: publicUser(fam, me),
      program: program ? { code: program.code, name: program.name, currency: program.currency, visa: program.visa } : null,
      compliance: checkCompliance(program, { ...p, birth_date: getProfile(ap)?.birth_date, nationality: getProfile(ap)?.nationality }, me.lang),
      tasks: withOffers(db.prepare('SELECT * FROM placement_tasks WHERE placement_id = ? ORDER BY sort').all(p.id), p.country, me.role),
      agreement: agreementStatus(p),
      // How many of the family's visa documents are ready, once the placement is confirmed.
      documents: AGREEMENT_OPEN.includes(p.status) ? {
        done: db.prepare('SELECT COUNT(*) n FROM placement_documents WHERE placement_id = ?').get(p.id).n,
        total: familyDocuments(program, getProfile(ap)?.nationality).length } : null,
      my_review: myReview ? { ...myReview, criteria: json.parse(myReview.criteria, {}) } : null,
      can_review: me.role !== 'admin' && ['active', 'completed'].includes(p.status) && !myReview,
      review_criteria: REVIEW_CRITERIA[me.id === p.aupair_id ? 'family' : 'aupair'],
      // Only the family sees whether their Rematch Guarantee covers this placement.
      rematch: me.id === p.family_id ? rematchCover(p.id) : null,
    };
  };

  // ---------- partner offers ----------
  const offerRow = (o) => ({ ...o, countries: json.parse(o.countries, []), active: !!o.active });
  /** Adds the active partner offers for each checklist step, matched by step, host country and who is looking. */
  const withOffers = (tasks, country, role) => {
    const offers = db.prepare('SELECT * FROM partner_offers WHERE active = 1 ORDER BY id').all().map(offerRow)
      .filter((o) => (!o.countries.length || o.countries.includes(country)) && (role === 'admin' || o.audience === 'both' || o.audience === role));
    return tasks.map((t) => {
      const slot = taskSlot(t.title);
      return { ...t, offers: slot ? offers.filter((o) => o.slot === slot).map(({ id, name, blurb, lead_email }) => ({ id, name, blurb, referral: !!lead_email })) : [] };
    });
  };
  /** Partner agencies that take referrals for a host country, e.g. J-1 sponsors for the US. */
  const referralAgencies = (country, role) => db.prepare("SELECT * FROM partner_offers WHERE active = 1 AND slot = 'sponsor' AND lead_email IS NOT NULL ORDER BY id").all()
    .map(offerRow).filter((o) => (!o.countries.length || o.countries.includes(country)) && (o.audience === 'both' || o.audience === role))
    .map(({ id, name, blurb }) => ({ id, name, blurb, referral: true }));
  const cleanOffer = (b, old = {}) => {
    const o = { ...old, ...b };
    const name = str(o.name, 80); const url = str(o.url, 1000); const slot = o.slot;
    if (!name) throw bad('Name is required.');
    if (!url || !/^https:\/\/[^\s]+$/.test(url)) throw bad('The link must start with https://');
    if (!(slot in PARTNER_SLOTS)) throw bad('Choose a checklist step.');
    const audience = ['aupair', 'family', 'both'].includes(o.audience) ? o.audience : 'both';
    const countries = (Array.isArray(o.countries) ? o.countries : String(o.countries || '').split(','))
      .map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
    const lead = str(o.lead_email, 254) || null;
    if (lead && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead)) throw bad('Enter a valid email.');
    return [name, slot, url, str(o.blurb, 200) || null, json.str([...new Set(countries)]), audience, o.active === false || o.active === 0 ? 0 : 1, lead];
  };
  // People leave through this link, so every click is counted. Works without signing in (the phone app opens it in the browser).
  api.get('/partner-offers/:id/go', wrap((req, res) => {
    const o = db.prepare('SELECT * FROM partner_offers WHERE id = ? AND active = 1').get(Number(req.params.id));
    if (!o) throw notFound();
    db.prepare('INSERT INTO partner_clicks (offer_id, user_id) VALUES (?, ?)').run(o.id, req.user?.id ?? null);
    res.redirect(302, o.url);
  }));
  // Public list for the "Our partners" page: who we work with, never the links' tracking codes.
  api.get('/partners', wrap(() => ({
    partners: db.prepare('SELECT name, slot, blurb FROM partner_offers WHERE active = 1 GROUP BY name, slot ORDER BY slot, name').all(),
  })));
  api.get('/admin/partner-offers', requireRole('admin'), wrap(() => ({
    slots: Object.keys(PARTNER_SLOTS),
    offers: db.prepare(`SELECT o.*,
        (SELECT COUNT(*) FROM partner_clicks c WHERE c.offer_id = o.id) clicks,
        (SELECT COUNT(*) FROM partner_clicks c WHERE c.offer_id = o.id AND c.created_at >= datetime('now', 'start of month')) clicks_this_month
      FROM partner_offers o ORDER BY o.active DESC, o.slot, o.name`).all().map(offerRow),
  })));
  api.post('/admin/partner-offers', requireRole('admin'), wrap((req) => {
    const r = db.prepare('INSERT INTO partner_offers (name, slot, url, blurb, countries, audience, active, lead_email) VALUES (?,?,?,?,?,?,?,?)').run(...cleanOffer(req.body || {}));
    return offerRow(db.prepare('SELECT * FROM partner_offers WHERE id = ?').get(r.lastInsertRowid));
  }));
  api.put('/admin/partner-offers/:id', requireRole('admin'), wrap((req) => {
    const old = db.prepare('SELECT * FROM partner_offers WHERE id = ?').get(Number(req.params.id));
    if (!old) throw notFound();
    db.prepare('UPDATE partner_offers SET name = ?, slot = ?, url = ?, blurb = ?, countries = ?, audience = ?, active = ?, lead_email = ? WHERE id = ?')
      .run(...cleanOffer(req.body || {}, offerRow(old)), old.id);
    return offerRow(db.prepare('SELECT * FROM partner_offers WHERE id = ?').get(old.id));
  }));
  api.delete('/admin/partner-offers/:id', requireRole('admin'), wrap((req) => {
    db.prepare('DELETE FROM partner_offers WHERE id = ?').run(Number(req.params.id));
    return { ok: true };
  }));

  // ---------- partner agency referrals ----------
  // "Get help from a partner agency": with the person's consent, their details go to the agency with a referral code.
  // The referral counts as started when a placement of theirs on PairMundo starts, or when the agency reports it.
  api.post('/partner-offers/:id/refer', requireRole('aupair', 'family'), wrap((req, res) => {
    const o = db.prepare('SELECT * FROM partner_offers WHERE id = ? AND active = 1 AND lead_email IS NOT NULL').get(Number(req.params.id));
    if (!o) throw notFound();
    if (req.body?.consent !== true) throw bad('Agree to share your details with the agency first.');
    const me = req.user;
    // One referral per person and agency for 12 months.
    const old = db.prepare("SELECT * FROM agency_referrals WHERE user_id = ? AND offer_id = ? AND created_at >= datetime('now', '-12 months')").get(me.id, o.id);
    if (old) return { code: old.code, agency: o.name, already: true };
    const placement = req.body?.placement_id ? db.prepare('SELECT * FROM placements WHERE id = ? AND (aupair_id = ? OR family_id = ?)').get(Number(req.body.placement_id), me.id, me.id) : null;
    const hostCountry = placement?.country || (me.role === 'family' ? me.country : json.parse(o.countries, [])[0]) || null;
    const code = `PM-${randomBytes(4).toString('hex').toUpperCase()}`;
    db.prepare('INSERT INTO agency_referrals (offer_id, agency, user_id, host_country, code) VALUES (?,?,?,?,?)').run(o.id, o.name, me.id, hostCountry, code);
    const profile = getProfile(me);
    const lead = { agency: o.name, code, name: me.name, email: me.email, role: me.role, lives_in: me.country ? countryName('en-GB', me.country, me.country) : '',
      nationality: profile?.nationality ? countryName('en-GB', profile.nationality, profile.nationality) : '',
      host_country: hostCountry ? countryName('en-GB', hostCountry, hostCountry) : '',
      dates: placement ? `${placement.start_date} to ${placement.end_date}` : profile?.start_date || profile?.available_from || '' };
    Promise.resolve(mailer({ to: o.lead_email, ...agencyLeadEmail(lead) })).catch((e) => console.error('Email failed:', e.message));
    res.status(201);
    return { code, agency: o.name };
  }));
  api.get('/admin/referrals', requireRole('admin'), wrap(() => ({
    statuses: REFERRAL_STATUSES,
    referrals: db.prepare(`SELECT r.*, u.name user_name, u.email user_email, u.role user_role FROM agency_referrals r
      LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id DESC`).all(),
  })));
  api.put('/admin/referrals/:id', requireRole('admin'), wrap((req) => {
    const status = req.body?.status;
    if (!REFERRAL_STATUSES.includes(status)) throw bad('Choose a status.');
    const r = db.prepare(`UPDATE agency_referrals SET status = ?, started_at = CASE WHEN ? = 'started' THEN COALESCE(started_at, datetime('now')) ELSE NULL END
      WHERE id = ?`).run(status, status, Number(req.params.id));
    if (!r.changes) throw notFound();
    return db.prepare('SELECT * FROM agency_referrals WHERE id = ?').get(Number(req.params.id));
  }));

  // ---------- au pair agreement ----------
  const AGREEMENT_OPEN = ['confirmed', 'active', 'completed'];
  const agreementRow = (p) => db.prepare('SELECT * FROM placement_agreements WHERE placement_id = ?').get(p.id);
  const agreementStatus = (p) => {
    if (!AGREEMENT_OPEN.includes(p.status)) return null;
    const a = agreementRow(p);
    return { aupair_signed_at: a?.aupair_signed_at || null, family_signed_at: a?.family_signed_at || null };
  };
  const agreementView = (p, me, lang) => {
    const a = agreementRow(p);
    const terms = { ...defaultTerms(p.country), ...json.parse(a?.terms, {}) };
    const ap = getUser(p.aupair_id); const fam = getUser(p.family_id);
    const program = getProgram(p.country);
    const nat = getProfile(ap)?.nationality;
    const signed = (side) => (a?.[`${side}_signed_at`] ? { name: a[`${side}_signed_name`], at: a[`${side}_signed_at`] } : null);
    return {
      placement_id: p.id, status: p.status, terms,
      missing: REQUIRED_TERMS.filter((k) => terms[k] == null),
      signatures: { aupair: signed('aupair'), family: signed('family') },
      my_side: me.id === p.aupair_id ? 'aupair' : me.id === p.family_id ? 'family' : null,
      editable: me.role !== 'admin' && ['confirmed', 'active'].includes(p.status),
      sections: buildAgreement({ placement: p, program, aupair: ap, family: fam, terms,
        countryName: regionName(lang, p.country), nationalityName: nat ? regionName(lang, nat) : '' }),
    };
  };
  const loadAgreementPlacement = (req) => {
    const p = loadPlacement(req);
    if (!AGREEMENT_OPEN.includes(p.status)) throw bad('The agreement opens once both of you have confirmed the placement.');
    return p;
  };
  // Country names in the reader's language, English included.
  const regionName = (lang, code) => countryName(lang === 'en' ? 'en-GB' : lang, code, code);
  const reqLang = (req) => pickLang(req.get('accept-language')) || req.user.lang || 'en';

  api.get('/placements/:id/agreement', requireAuth, wrap((req) => agreementView(loadAgreementPlacement(req), req.user, reqLang(req))));

  api.put('/placements/:id/agreement', requireRole('aupair', 'family'), wrap((req) => {
    const p = loadAgreementPlacement(req);
    if (!['confirmed', 'active'].includes(p.status)) throw bad('This agreement can no longer be changed.');
    const a = agreementRow(p);
    const terms = cleanTerms(req.body?.terms || {}, { ...defaultTerms(p.country), ...json.parse(a?.terms, {}) }, bad);
    const wasSigned = a?.aupair_signed_at || a?.family_signed_at;
    // New terms need both signatures again.
    db.prepare(`INSERT INTO placement_agreements (placement_id, terms) VALUES (?, ?)
      ON CONFLICT(placement_id) DO UPDATE SET terms = excluded.terms, aupair_signed_name = NULL, aupair_signed_at = NULL,
        family_signed_name = NULL, family_signed_at = NULL, updated_at = datetime('now')`).run(p.id, json.str(terms));
    const other = req.user.id === p.aupair_id ? p.family_id : p.aupair_id;
    if (wasSigned) {
      db.prepare("UPDATE placement_tasks SET done = 0 WHERE placement_id = ? AND title = 'Sign au pair agreement / contract'").run(p.id);
      notify(other, 'placement', '{name} changed the au pair agreement. Read it again and sign it.', { name: shortName(req.user.name) }, `#/placements/${p.id}/agreement`);
    }
    return agreementView(p, req.user, reqLang(req));
  }));

  api.post('/placements/:id/agreement/sign', requireRole('aupair', 'family'), wrap((req) => {
    const p = loadAgreementPlacement(req);
    if (!['confirmed', 'active'].includes(p.status)) throw bad('This agreement can no longer be changed.');
    const name = str(req.body?.name, 120);
    if (!name || name.length < 2) throw bad('Type your full name to sign.');
    const view = agreementView(p, req.user, reqLang(req));
    if (view.missing.length) throw bad('Fill in the days off, paid holiday and notice period before signing.');
    const side = req.user.id === p.aupair_id ? 'aupair' : 'family';
    if (view.signatures[side]) throw new HttpError(409, 'You have already signed this agreement.');
    db.prepare(`INSERT INTO placement_agreements (placement_id, terms) VALUES (?, ?) ON CONFLICT(placement_id) DO NOTHING`).run(p.id, json.str(view.terms));
    db.prepare(`UPDATE placement_agreements SET ${side}_signed_name = ?, ${side}_signed_at = datetime('now') WHERE placement_id = ?`).run(name, p.id);
    const a = agreementRow(p);
    const other = side === 'aupair' ? p.family_id : p.aupair_id;
    if (a.aupair_signed_at && a.family_signed_at) {
      db.prepare("UPDATE placement_tasks SET done = 1 WHERE placement_id = ? AND title = 'Sign au pair agreement / contract'").run(p.id);
      notify(other, 'placement', 'Your au pair agreement is signed by both of you.', {}, `#/placements/${p.id}/agreement`);
    } else {
      notify(other, 'placement', '{name} signed the au pair agreement. Read it and sign it too.', { name: shortName(req.user.name) }, `#/placements/${p.id}/agreement`);
    }
    return agreementView(p, req.user, reqLang(req));
  }));

  // ---------- visa documents ----------
  // What the family hands in for the au pair's visa, with the invitation letter written from the placement.
  const documentsView = (p, me, lang) => {
    const ap = getUser(p.aupair_id); const fam = getUser(p.family_id);
    const program = getProgram(p.country);
    const nat = getProfile(ap)?.nationality;
    const done = new Set(db.prepare('SELECT doc_key FROM placement_documents WHERE placement_id = ?').all(p.id).map((r) => r.doc_key));
    const route = visaRoute(program, nat, p.start_date);
    if (route?.kind === 'sponsor') route.agencies = referralAgencies(p.country, me.role === 'admin' ? 'family' : me.role);
    return {
      placement_id: p.id, status: p.status, country: p.country, route,
      editable: me.id === p.family_id && ['confirmed', 'active'].includes(p.status),
      documents: familyDocuments(program, nat).map((d) => ({ ...d, done: done.has(d.key) })),
      address: p.host_address || '',
      letter: buildHostLetter({ placement: p, program, aupair: ap, family: fam, address: p.host_address,
        countryName: regionName(lang, p.country), nationalityName: nat ? regionName(lang, nat) : '' }),
      family_name: fam.name,
    };
  };
  api.get('/placements/:id/documents', requireAuth, wrap((req) => documentsView(loadAgreementPlacement(req), req.user, reqLang(req))));
  api.put('/placements/:id/documents', requireRole('family'), wrap((req) => {
    const p = loadAgreementPlacement(req);
    if (p.family_id !== req.user.id || !['confirmed', 'active'].includes(p.status)) throw bad('These documents can no longer be changed.');
    const b = req.body || {};
    if (b.address !== undefined) db.prepare('UPDATE placements SET host_address = ? WHERE id = ?').run(str(b.address, 300) || null, p.id);
    if (b.doc !== undefined) {
      const keys = familyDocuments(getProgram(p.country), getProfile(getUser(p.aupair_id))?.nationality).map((d) => d.key);
      if (!keys.includes(b.doc)) throw bad('Choose a document from the list.');
      if (b.done) db.prepare('INSERT INTO placement_documents (placement_id, doc_key) VALUES (?, ?) ON CONFLICT DO NOTHING').run(p.id, b.doc);
      else db.prepare('DELETE FROM placement_documents WHERE placement_id = ? AND doc_key = ?').run(p.id, b.doc);
    }
    return documentsView(db.prepare('SELECT * FROM placements WHERE id = ?').get(p.id), req.user, reqLang(req));
  }));

  api.get('/placements', requireAuth, wrap((req) => {
    const rows = req.user.role === 'admin'
      ? db.prepare('SELECT * FROM placements ORDER BY created_at DESC').all()
      : db.prepare('SELECT * FROM placements WHERE aupair_id = ? OR family_id = ? ORDER BY created_at DESC').all(req.user.id, req.user.id);
    return {
      placements: rows.map((p) => ({ ...p, aupair: publicUser(getUser(p.aupair_id), req.user), family: publicUser(getUser(p.family_id), req.user),
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
      attachGuarantee(p.family_id);
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
    if (next === 'cancelled') claimRematch(p, p.status);
    // The stay has started: whoever an ambassador brought in, on either side, earns them the placement reward.
    if (next === 'active') for (const uid of [p.aupair_id, p.family_id]) addReward(uid, 'placement', AMBASSADOR_REWARDS.placement, `Placement ${p.id}`);
    // So does a partner agency referral of either side, for the agency's referral fee.
    if (next === 'active') {
      db.prepare(`UPDATE agency_referrals SET status = 'started', started_at = datetime('now')
        WHERE user_id IN (?, ?) AND status IN ('referred', 'in_process') AND created_at >= datetime('now', '-12 months')`).run(p.aupair_id, p.family_id);
    }
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
    notify(reviewee, 'review', '{name} left you a review. It appears once you review them too, or {days} days after the placement ends.', { name: shortName(req.user.name), days: REVIEW_REVEAL_DAYS }, `#/placements/${p.id}`);
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

  // An au pair who signed up without their agency's code can add it later. It can't be changed once set, because the
  // code also decides which ambassador or agency they count for.
  api.post('/me/agency', requireRole('aupair'), wrap((req) => {
    const a = ambassadorByCode(referralCode(req.body?.code));
    if (!a || a.kind !== 'agency') throw bad('That agency code is not valid. Check it with your agency.');
    if (req.user.ref_code) throw bad('Your account is already linked to a code.');
    db.prepare('UPDATE users SET ref_code = ? WHERE id = ?').run(a.code, req.user.id);
    return { agency: a.name };
  }));

  // An ambassador's own numbers, shown in their app.
  api.get('/me/ambassador', requireAuth, wrap((req) => {
    const a = db.prepare('SELECT * FROM ambassadors WHERE user_id = ? AND active = 1').get(req.user.id);
    if (!a) throw notFound();
    // A partner agency sees how its au pairs are doing, and nothing about rewards.
    if (a.kind === 'agency') {
      return { kind: 'agency', code: a.code, name: a.name, link: referralLink(a),
        this_month: agencyStats(a, new Date().toISOString().slice(0, 7)), total: agencyStats(a) };
    }
    // A flyer distributor sees their sessions and pay. Which families joined stays with the admin.
    if (a.kind === 'distributor') {
      return { kind: 'distributor', code: a.code, name: a.name, areas: areasOf(a),
        rates: { flyer_ore: a.flyer_rate, family_ore: a.family_bonus, bonus_days: a.bonus_days },
        this_month: distributorStats(a, new Date().toISOString().slice(0, 7)), total: distributorStats(a),
        sessions: flyerSessions(a).map(({ id, area, flyers, amount_ore, delivered_on, families, paid_at }) => ({ id, area, flyers, amount_ore, delivered_on, families, paid: !!paid_at })) };
    }
    return { kind: 'ambassador', code: a.code, name: a.name, link: referralLink(a), rewards: AMBASSADOR_REWARDS,
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
    early_bonus: { ...earlyOffer(), accounts: db.prepare('SELECT COUNT(*) n FROM early_bonus WHERE user_id IS NOT NULL').get().n,
      redeemed: db.prepare('SELECT COUNT(*) n FROM early_bonus WHERE redeemed_at IS NOT NULL').get().n, use_by: earlyUseBy() },
    gifts: db.prepare('SELECT COUNT(*) saved, COUNT(redeemed_at) redeemed FROM ref_gifts').get(),
  })));
  // The whole list as a spreadsheet file, for emailing everyone at launch.
  api.get('/admin/waitlist.csv', requireRole('admin'), (req, res) => {
    const rows = db.prepare('SELECT email, role, country, lang, source, ref_code, created_at FROM waitlist ORDER BY created_at').all();
    res.set('Content-Disposition', 'attachment; filename="pairmundo-waitlist.csv"').type('text/csv')
      .send(['email,role,country,language,source,referral code,joined', ...rows.map((r) => [r.email, r.role, r.country, r.lang, r.source, r.ref_code, r.created_at].map(csvCell).join(','))].join('\n') + '\n');
  });

  // Launch day: an admin presses "Send launch email" and everyone hears the apps are out, in their language.
  // That is everyone on the waitlist plus every confirmed account (not admins, not suspended), once per email.
  // Each press sends up to `limit` emails one after another (Resend's free plan allows 100 a day), stops at the first
  // failure, and the next press carries on with whoever hasn't had it yet.
  const storeLinks = () => [['iPhone (App Store)', process.env.APP_STORE_URL], ['Android (Google Play)', process.env.PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.pairmundo.app']]
    .filter(([, url]) => url);
  const launchRecipients = () => {
    const sent = new Set(db.prepare('SELECT email FROM launch_emails').all().map((r) => r.email));
    const seen = new Set();
    const out = [];
    for (const u of db.prepare("SELECT * FROM users WHERE role != 'admin' AND suspended = 0 AND email_verified = 1 ORDER BY created_at, id").all()) {
      const email = normEmail(u.email);
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ email, kind: 'account', user: u, role: u.role, lang: u.lang, done: sent.has(email) });
    }
    for (const w of db.prepare('SELECT * FROM waitlist ORDER BY created_at, rowid').all()) {
      if (seen.has(w.email)) continue;
      seen.add(w.email);
      out.push({ email: w.email, kind: 'waitlist', role: w.role, lang: w.lang, token: w.token, done: sent.has(w.email) });
    }
    return out;
  };
  const earlyUseBy = () => (earlyEnds() ? new Date(earlyEnds().getTime() - 86400000).toISOString().slice(0, 10) : null);
  /** The free days a family can still use, for the reminder in their email, or null. */
  const launchEarly = (r) => {
    if (r.kind === 'account') { const v = earlyView(r.user); return v && !v.redeemed && !v.expired ? v : null; }
    if (r.role !== 'family' || !earlyDays()) return null;
    const b = db.prepare('SELECT redeemed_at FROM early_bonus WHERE email = ?').get(r.email);
    const ends = earlyEnds();
    return b && !b.redeemed_at && !(ends && Date.now() >= ends.getTime()) ? { days: earlyDays(), use_by: earlyUseBy() } : null;
  };
  const launchEmailFor = (r, early = launchEarly(r)) => {
    const lang = r.lang || 'en';
    let useBy = early?.use_by || null;
    if (useBy) try { useBy = new Date(`${useBy}T00:00:00Z`).toLocaleDateString(lang, { dateStyle: 'long', timeZone: 'UTC' }); } catch { /* keep the ISO date */ }
    return launchEmail(lang, { kind: r.kind, role: r.role, email: r.email, links: storeLinks(), earlyDays: early?.days || 0, useBy,
      leaveUrl: r.token ? `${publicBase()}/api/waitlist/leave?t=${r.token}` : null });
  };
  const launchJob = { running: false, sent: 0, error: null, finished_at: null };
  const launchStatus = () => {
    const all = launchRecipients();
    const left = all.filter((r) => !r.done);
    const count = (f) => all.filter(f).length;
    return { total: all.length, sent: all.length - left.length, remaining: left.length, launch_date: launchDate(), too_early: !!launchDate() && !launched(),
      store_links: storeLinks(), app_store_missing: !process.env.APP_STORE_URL,
      breakdown: { families_with_account: count((r) => r.kind === 'account' && r.role === 'family'), aupairs_with_account: count((r) => r.kind === 'account' && r.role === 'aupair'),
        waitlist_families: count((r) => r.kind === 'waitlist' && r.role === 'family'), waitlist_aupairs: count((r) => r.kind === 'waitlist' && r.role === 'aupair'),
        waitlist_other: count((r) => r.kind === 'waitlist' && !['family', 'aupair'].includes(r.role)) },
      job: { ...launchJob } };
  };
  // What each kind of person will get, in English, so the admin can read it before sending.
  const launchSamples = () => {
    const early = earlyDays() ? { days: earlyDays(), use_by: earlyUseBy() } : null;
    return [
      ['Family with an account and unused early free days', { kind: 'account', role: 'family' }, early],
      ['Family on the waitlist with early free days', { kind: 'waitlist', role: 'family', token: '…' }, early],
      ['Au pair with an account', { kind: 'account', role: 'aupair' }, null],
      ['Au pair on the waitlist', { kind: 'waitlist', role: 'aupair', token: '…' }, null],
      ['On the waitlist without saying family or au pair', { kind: 'waitlist', role: null, token: '…' }, null],
    ].map(([label, r, e]) => ({ label, ...launchEmailFor({ email: 'name@example.com', lang: 'en', ...r }, e) }));
  };
  const runLaunchEmails = async (limit) => {
    const gap = envInt('LAUNCH_EMAIL_GAP_MS', 600, 60000);
    launchJob.running = true; launchJob.sent = 0; launchJob.error = null; launchJob.finished_at = null;
    try {
      for (const r of launchRecipients().filter((x) => !x.done).slice(0, limit)) {
        // Someone could leave the list or be suspended while this runs.
        if (r.kind === 'waitlist' && !db.prepare('SELECT 1 FROM waitlist WHERE email = ?').get(r.email)) continue;
        if (r.kind === 'account' && !db.prepare('SELECT 1 FROM users WHERE id = ? AND suspended = 0').get(r.user.id)) continue;
        try {
          await mailer({ to: r.email, ...launchEmailFor(r) });
        } catch (e) {
          launchJob.error = `Stopped at ${r.email}: ${e.message}`;
          console.error('Launch email failed:', e.message);
          break;
        }
        db.prepare('INSERT OR IGNORE INTO launch_emails (email) VALUES (?)').run(r.email);
        launchJob.sent++;
        if (gap) await new Promise((res) => setTimeout(res, gap));
      }
    } finally {
      launchJob.running = false; launchJob.finished_at = new Date().toISOString();
    }
  };
  api.get('/admin/launch-email', requireRole('admin'), wrap(() => ({ ...launchStatus(), samples: launchSamples() })));
  api.post('/admin/launch-email/test', requireRole('admin'), wrap(async (req) => {
    for (const s of launchSamples()) await mailer({ to: req.user.email, subject: `[Test: ${s.label}] ${s.subject}`, text: s.text });
    return { ok: true, to: req.user.email, count: launchSamples().length };
  }));
  api.post('/admin/launch-email/send', requireRole('admin'), wrap((req) => {
    if (launchDate() && !launched()) throw new HttpError(409, `It isn't launch day yet (LAUNCH_DATE is ${launchDate()}). The email says the apps are out, so it can only go out from then.`);
    if (launchJob.running) throw new HttpError(409, 'The launch email is already sending.');
    const limit = Math.min(Math.max(Math.floor(Number(req.body?.limit)) || 100, 1), 5000);
    app.launchEmailRun = runLaunchEmails(limit).catch((e) => { launchJob.error = e.message; console.error('Launch email failed:', e); });
    return launchStatus();
  }));

  // Before launch: families on the waitlist can already make their profile on the website, so an admin can invite
  // those without an account to do it now, then remind them once (PROFILE_REMINDER_DAYS, 5 unless set, after the
  // invite). Each press sends up to `limit` emails; nobody gets the same kind twice, and anyone who has signed up since
  // is skipped.
  const reminderDays = () => envInt('PROFILE_REMINDER_DAYS', 5, 60);
  const inviteRecipients = (kind) => db.prepare(`SELECT w.* FROM waitlist w WHERE w.role = 'family'
      AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(trim(u.email)) = w.email)
      AND NOT EXISTS (SELECT 1 FROM profile_invites i WHERE i.email = w.email AND i.kind = ?)
      ${kind === 'reminder' ? "AND EXISTS (SELECT 1 FROM profile_invites i WHERE i.email = w.email AND i.kind = 'invite' AND i.sent_at <= datetime('now', ?))" : ''}
    ORDER BY w.created_at, w.rowid`).all(...(kind === 'reminder' ? [kind, `-${reminderDays()} days`] : [kind]));
  const inviteEmailFor = (w, kind) => {
    const b = earlyDays() && db.prepare('SELECT redeemed_at FROM early_bonus WHERE email = ?').get(w.email);
    return profileInviteEmail(w.lang || 'en', { kind, email: w.email, earlyDays: b && !b.redeemed_at ? earlyDays() : 0,
      signupUrl: `${publicBase()}/#/register?role=family&email=${encodeURIComponent(w.email)}`, leaveUrl: `${publicBase()}/api/waitlist/leave?t=${w.token}` });
  };
  const inviteStatus = () => {
    const n = (sql, ...a) => db.prepare(sql).get(...a).n;
    const families = db.prepare("SELECT * FROM users WHERE role = 'family' AND suspended = 0").all();
    const onList = new Set(db.prepare("SELECT email FROM waitlist WHERE role = 'family'").all().map((r) => r.email));
    const fromList = families.filter((u) => onList.has(normEmail(u.email)));
    return {
      waitlist_families: onList.size,
      waitlist_signed_up: fromList.length,
      waitlist_profiles_done: fromList.filter((u) => !profileGaps(u).length).length,
      family_accounts: families.length,
      family_profiles_done: families.filter((u) => !profileGaps(u).length).length,
      invited: n("SELECT COUNT(*) n FROM profile_invites WHERE kind = 'invite'"),
      reminded: n("SELECT COUNT(*) n FROM profile_invites WHERE kind = 'reminder'"),
      invite_ready: inviteRecipients('invite').length,
      reminder_ready: inviteRecipients('reminder').length,
      reminder_days: reminderDays(),
      samples: ['invite', 'reminder'].map((kind) => ({ kind, ...inviteEmailFor({ email: 'name@example.com', lang: 'en', token: '…' }, kind) })),
    };
  };
  api.get('/admin/profile-invites', requireRole('admin'), wrap(() => inviteStatus()));
  api.post('/admin/profile-invites/send', requireRole('admin'), wrap(async (req) => {
    const kind = req.body?.kind === 'reminder' ? 'reminder' : 'invite';
    const limit = Math.min(Math.max(Math.floor(Number(req.body?.limit)) || 100, 1), 1000);
    let sent = 0; let error = null;
    for (const w of inviteRecipients(kind).slice(0, limit)) {
      try { await mailer({ to: w.email, ...inviteEmailFor(w, kind) }); } catch (e) { error = `Stopped at ${w.email}: ${e.message}`; console.error('Profile invite failed:', e.message); break; }
      db.prepare('INSERT OR IGNORE INTO profile_invites (email, kind) VALUES (?,?)').run(w.email, kind);
      sent++;
    }
    return { ...inviteStatus(), sent, error };
  }));
  api.post('/admin/profile-invites/test', requireRole('admin'), wrap(async (req) => {
    const { samples } = inviteStatus();
    for (const m of samples) await mailer({ to: req.user.email, subject: `[Test: ${m.kind}] ${m.subject}`, text: m.text });
    return { ok: true, to: req.user.email, count: samples.length };
  }));

  // Ambassadors: create them, see what each code brought in, and record payouts.
  const ambassadorFields = (body, a = {}) => {
    const name = 'name' in body ? str(body.name, 120) : a.name;
    if (!name) throw bad('Name is required.');
    let userId = a.user_id ?? null;
    let inviteEmail = a.invite_email ?? null;
    if ('account_email' in body) {
      const email = normEmail(body.account_email);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email.');
      const user = email ? db.prepare('SELECT id, role FROM users WHERE lower(trim(email)) = ?').get(email) : null;
      if (user?.role === 'admin') throw bad('That email belongs to an admin account.');
      // No account with that email yet: they're invited to create one, and it's linked when they confirm the email.
      userId = user?.id ?? null;
      inviteEmail = email && !user ? email : null;
    }
    const text = (k, max) => (k in body ? str(body[k], max) || null : a[k] ?? null);
    // Free days of the pass for families who sign up with the code. Families already signed up keep what they got.
    const giftDays = 'gift_days' in body ? Number(body.gift_days || 0) : Number(a.gift_days ?? 0);
    if (!Number.isInteger(giftDays) || giftDays < 0 || giftDays > 365) throw bad('Gift days are a whole number from 0 to 365.');
    // A distributor's pay is entered in kronor and kept in öre.
    const kr = (k, label) => {
      if (!(k in body)) return Number(a[k] ?? (k === 'flyer_rate' ? 100 : 5000));
      const n = Math.round(Number(String(body[k]).replace(',', '.')) * 100);
      if (!Number.isFinite(n) || n < 0 || n > 1000000) throw bad(`${label} is an amount in kronor, like 1 or 0.50.`);
      return n;
    };
    const bonusDays = 'bonus_days' in body ? Number(body.bonus_days) : Number(a.bonus_days ?? 28);
    if (!Number.isInteger(bonusDays) || bonusDays < 0 || bonusDays > 365) throw bad('The bonus period is a whole number of days, from 0 to 365.');
    let areas = a.areas ?? [];
    if ('areas' in body) {
      areas = [...new Set((Array.isArray(body.areas) ? body.areas : String(body.areas ?? '').split(/[\s,]+/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
      if (areas.some((x) => !/^[a-z0-9][a-z0-9-]{0,39}$/.test(x))) throw bad('Areas are flyer sources like door-nacka, separated by commas.');
    }
    const kind = 'kind' in body ? (['agency', 'distributor'].includes(body.kind) ? body.kind : 'ambassador') : a.kind ?? 'ambassador';
    return { name, country: text('country', 2)?.toUpperCase() ?? null, contact: text('contact', 200), notes: text('notes', 2000), user_id: userId,
      active: 'active' in body ? (body.active ? 1 : 0) : Number(a.active ?? 1), gift_days: giftDays, kind, invite_email: inviteEmail,
      flyer_rate: kr('flyer_rate', 'Pay per flyer'), family_bonus: kr('family_bonus', 'Pay per family'), bonus_days: bonusDays, areas: JSON.stringify(areas) };
  };
  /** Emails someone without an account an invite to create one, so they can see their code's numbers. */
  const sendAmbassadorInvite = (a) => {
    // Agencies and ambassadors have their own sign-up pages; the au pair and family one would make the wrong account.
    const page = a.kind === 'agency' ? 'agency-signup' : `ambassador-signup${a.kind === 'distributor' ? '?for=flyers&' : '?'}`;
    const signup = `${publicBase()}/#/${page}${a.kind === 'agency' ? '?' : ''}email=${encodeURIComponent(a.invite_email)}`;
    Promise.resolve(mailer({ to: a.invite_email, ...ambassadorInviteEmail({ ...a, link: referralLink(a), signup, email: a.invite_email }) }))
      .catch((e) => console.error('Email failed:', e.message));
  };
  /** Links an account to the code it was invited to, once its email is confirmed. */
  const claimInvite = (user) => {
    const a = db.prepare('SELECT id, code FROM ambassadors WHERE user_id IS NULL AND invite_email = ?').get(normEmail(user.email));
    if (!a) return;
    db.prepare('UPDATE ambassadors SET user_id = ?, invite_email = NULL WHERE id = ?').run(user.id, a.id);
    partnerLinked(user.id, a.code);
  };
  /** Tells an agency or ambassador account that its code is ready, the first time it is linked to one. */
  const partnerLinked = (userId, code) => {
    const role = getUser(userId)?.role;
    if (role === 'agency') notify(userId, 'agency', 'Your agency code {code} is ready. Share it with your au pairs.', { code }, '#/agency');
    const kind = db.prepare('SELECT kind FROM ambassadors WHERE code = ?').get(code)?.kind;
    if (role === 'ambassador' && kind === 'distributor') notify(userId, 'ambassador', 'Your flyer delivery page is ready. Your sessions and pay show there.', {}, '#/ambassador');
    else if (role === 'ambassador') notify(userId, 'ambassador', 'Your ambassador code {code} is ready. Share it to start earning.', { code }, '#/ambassador');
  };
  api.get('/admin/ambassadors', requireRole('admin'), wrap((req) => {
    const month = monthParam(req.query.month);
    return { month, rewards: AMBASSADOR_REWARDS,
      // Agencies and ambassadors that signed up and aren't linked to a code yet: the admin links them by their account email.
      partner_accounts: db.prepare(`SELECT id, role, name, email, country, created_at FROM users
        WHERE role IN ('agency', 'ambassador') AND id NOT IN (SELECT user_id FROM ambassadors WHERE user_id IS NOT NULL) ORDER BY created_at DESC`).all(),
      ambassadors: db.prepare('SELECT id FROM ambassadors ORDER BY active DESC, created_at DESC, id DESC').all().map((a) => adminAmbassador(a.id, month, false)) };
  }));
  api.post('/admin/ambassadors', requireRole('admin'), wrap((req, res) => {
    const code = referralCode(req.body?.code);
    if (!code) throw bad('A code is 3 to 24 letters, numbers or dashes, like ANACO.');
    if (db.prepare('SELECT 1 FROM ambassadors WHERE code = ?').get(code)) throw new HttpError(409, 'That code is already taken.');
    const f = ambassadorFields(req.body);
    const r = db.prepare('INSERT INTO ambassadors (code, name, country, contact, notes, user_id, active, gift_days, kind, invite_email, flyer_rate, family_bonus, bonus_days, areas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(code, f.name, f.country, f.contact, f.notes, f.user_id, f.active, f.gift_days, f.kind, f.invite_email, f.flyer_rate, f.family_bonus, f.bonus_days, f.areas);
    if (f.user_id) partnerLinked(f.user_id, code);
    if (f.invite_email) sendAmbassadorInvite({ ...f, code });
    res.status(201);
    return adminAmbassador(r.lastInsertRowid);
  }));
  api.get('/admin/ambassadors/:id', requireRole('admin'), wrap((req) => adminAmbassador(req.params.id, monthParam(req.query.month))));
  // The code can't change: the people who joined with it keep pointing at it.
  api.post('/admin/ambassadors/:id', requireRole('admin'), wrap((req) => {
    const a = adminAmbassador(req.params.id, null, false);
    const f = ambassadorFields(req.body || {}, a);
    db.prepare('UPDATE ambassadors SET name = ?, country = ?, contact = ?, notes = ?, user_id = ?, active = ?, gift_days = ?, kind = ?, invite_email = ?, flyer_rate = ?, family_bonus = ?, bonus_days = ?, areas = ? WHERE id = ?')
      .run(f.name, f.country, f.contact, f.notes, f.user_id, f.active, f.gift_days, f.kind, f.invite_email, f.flyer_rate, f.family_bonus, f.bonus_days, f.areas, a.id);
    if (f.user_id && f.user_id !== a.user_id) partnerLinked(f.user_id, a.code);
    // Saving the form again doesn't re-send; a new email (or ?resend=1) does.
    if (f.invite_email && (f.invite_email !== a.invite_email || req.query.resend)) sendAmbassadorInvite({ ...f, code: a.code });
    return adminAmbassador(a.id);
  }));
  // After paying an ambassador, mark what they earned up to the end of that month (or everything) as paid.
  api.post('/admin/ambassadors/:id/paid', requireRole('admin'), wrap((req) => {
    const a = adminAmbassador(req.params.id, null, false);
    const month = monthParam(req.body?.month);
    const m = month ? [month] : [];
    const mark = (table, when) => db.prepare(`UPDATE ${table} SET paid_at = datetime('now') WHERE ambassador_id = ? AND paid_at IS NULL${month ? ` AND ${when} <= ?` : ''}`).run(a.id, ...m).changes;
    if (a.kind === 'distributor') syncFlyerBonuses(a);
    const marked = mark('referral_rewards', "strftime('%Y-%m', created_at)") + mark('flyer_sessions', 'substr(delivered_on, 1, 7)') + mark('flyer_bonuses', "strftime('%Y-%m', joined_at)");
    return { marked, ...adminAmbassador(a.id) };
  }));
  // A flyer distributor's delivery session: the admin logs it after spot-checking a few streets, and it earns the
  // distributor's current rate per flyer.
  api.post('/admin/ambassadors/:id/sessions', requireRole('admin'), wrap((req, res) => {
    const a = adminAmbassador(req.params.id, null, false);
    if (a.kind !== 'distributor') throw bad('Only flyer distributors have delivery sessions.');
    const area = String(req.body?.area ?? '').trim().toLowerCase();
    if (!a.areas.includes(area)) throw bad('Choose one of their areas.');
    const flyers = Number(req.body?.flyers);
    if (!Number.isInteger(flyers) || flyers < 1 || flyers > 100000) throw bad('Flyers is a whole number, like 500.');
    const day = String(req.body?.delivered_on ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || day > new Date().toISOString().slice(0, 10)) throw bad('Enter the day they delivered, not in the future.');
    db.prepare('INSERT INTO flyer_sessions (ambassador_id, area, flyers, rate_ore, amount_ore, delivered_on, note) VALUES (?,?,?,?,?,?,?)')
      .run(a.id, area, flyers, a.flyer_rate, flyers * a.flyer_rate, day, str(req.body?.note, 300) || null);
    res.status(201);
    return adminAmbassador(a.id);
  }));
  // A session logged by mistake can go, until it's paid. Families it brought in move to another session in the same
  // area if there is one, or drop out.
  api.delete('/admin/ambassadors/:id/sessions/:sid', requireRole('admin'), wrap((req) => {
    const a = adminAmbassador(req.params.id, null, false);
    const s = db.prepare('SELECT * FROM flyer_sessions WHERE id = ? AND ambassador_id = ?').get(Number(req.params.sid), a.id);
    if (!s) throw notFound();
    if (s.paid_at) throw bad('That session is already paid.');
    db.prepare('DELETE FROM flyer_bonuses WHERE session_id = ? AND paid_at IS NULL').run(s.id);
    db.prepare('DELETE FROM flyer_sessions WHERE id = ?').run(s.id);
    return adminAmbassador(a.id);
  }));
  // The monthly payout sheet: one row per ambassador.
  api.get('/admin/ambassadors.csv', requireRole('admin'), (req, res) => {
    const month = monthParam(req.query.month);
    const usd = (c) => (c / 100).toFixed(2);
    // Flyer distributors are paid in kronor, from their own page.
    const rows = db.prepare("SELECT * FROM ambassadors WHERE kind <> 'distributor' ORDER BY code").all().map((a) => {
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
      pending_certificates: n("SELECT COUNT(*) n FROM certificate_proofs WHERE status = 'pending'"),
      open_requests: n("SELECT COUNT(*) n FROM match_requests WHERE status = 'pending'"),
      matches: n("SELECT COUNT(*) n FROM match_requests WHERE status = 'accepted'"),
      placements_active: n("SELECT COUNT(*) n FROM placements WHERE status IN ('confirmed','active')"),
      placements_completed: n("SELECT COUNT(*) n FROM placements WHERE status = 'completed'"),
      reviews: n('SELECT COUNT(*) n FROM reviews'),
      open_reports: n("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
      waitlist: n('SELECT COUNT(*) n FROM waitlist'),
      sitter_interest: Object.fromEntries([...SITTER_ANSWERS, null].map((a) => [a ?? 'unanswered',
        n(`SELECT COUNT(*) n FROM users u JOIN family_profiles f ON f.user_id = u.id WHERE u.role = 'family' AND f.wants_sitter ${a ? '= ?' : 'IS NULL'}`, ...(a ? [a] : []))])),
      by_country: db.prepare("SELECT country, role, COUNT(*) n FROM users WHERE role != 'admin' GROUP BY country, role ORDER BY n DESC").all(),
    };
  }));
  api.get('/admin/users', requireRole('admin'), wrap((req) => {
    const like = `%${req.query.q || ''}%`;
    return {
      users: db.prepare("SELECT * FROM users WHERE role != 'admin' AND (name LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT 200").all(like, like)
        .map((u) => ({ ...publicUser(u, req.user), email: u.email, suspended: !!u.suspended, rating: ratingSummary(u.id), source: u.source, pass_ends_at: u.role === 'family' ? activePass(u.id)?.ends_at ?? null : undefined })),
    };
  }));
  api.post('/admin/users/:id', requireRole('admin'), wrap((req) => {
    const u = getUser(req.params.id);
    if (!u || u.role === 'admin') throw notFound();
    const map = { id_verified: 'id_verified', references_checked: 'references_checked', background_checked: 'background_checked', suspended: 'suspended' };
    const sets = Object.keys(map).filter((k) => k in (req.body || {}));
    // An admin can give a family a free pass (for example to test, or as a goodwill gesture).
    const passDays = Number(req.body?.grant_pass_days);
    if (passDays > 0 && passDays <= 400 && u.role === 'family') { grantPass(u.id, 'admin', null, passDays); if (!sets.length) return { ...publicUser(getUser(u.id), req.user), pass: passView(u) }; }
    if (!sets.length) throw bad('Nothing to change.');
    db.prepare(`UPDATE users SET ${sets.map((k) => `${map[k]} = ?`).join(', ')} WHERE id = ?`).run(...sets.map((k) => (req.body[k] ? 1 : 0)), u.id);
    if (req.body.suspended) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    if (sets.some((k) => k !== 'suspended' && req.body[k])) notify(u.id, 'verification', 'Your profile has a new verification badge.', {}, '#/profile');
    if (req.body.id_verified) checkProfileReward(u.id);
    return { ...publicUser(getUser(u.id), req.user), suspended: !!getUser(u.id).suspended };
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
