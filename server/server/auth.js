import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

const SESSION_DAYS = 30;

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return { token, expires };
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
  return m?.[1];
}

/** Express middleware: attaches req.user when a valid session exists. */
export function sessionMiddleware(db) {
  const find = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                           WHERE s.token = ? AND s.expires_at > ?`);
  const touch = db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?");
  return (req, _res, next) => {
    const token = readToken(req);
    if (token) {
      const user = find.get(token, new Date().toISOString());
      if (user && !user.suspended) {
        req.user = user;
        req.sessionToken = token;
        touch.run(user.id);
      }
    }
    next();
  };
}

export const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Please sign in.' });

export const requireRole = (...roles) => (req, res, next) =>
  !req.user ? res.status(401).json({ error: 'Please sign in.' })
    : roles.includes(req.user.role) ? next()
      : res.status(403).json({ error: 'Not allowed for your account type.' });

/** Tiny fixed-window rate limiter for auth endpoints. */
export function rateLimit({ windowMs = 60000, max = 20 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) hits.set(key, { start: now, count: 1 });
    else if (++entry.count > max) return res.status(429).json({ error: 'Too many attempts, try again shortly.' });
    next();
  };
}
