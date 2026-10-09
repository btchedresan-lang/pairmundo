// Node 22.5+ has SQLite built in. Older Node (20) falls back to the better-sqlite3 package, which has the same synchronous API.
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = (await import('better-sqlite3')).default; }
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('aupair','family','admin')),
  name TEXT NOT NULL,
  country TEXT,
  city TEXT,
  photo_url TEXT,
  photos TEXT NOT NULL DEFAULT '[]',              -- JSON [url], first is the main photo
  id_verified INTEGER NOT NULL DEFAULT 0,
  references_checked INTEGER NOT NULL DEFAULT 0,
  background_checked INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blocks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_id)
);

-- One-time email codes (purpose verify | reset); only a hash is stored.
CREATE TABLE IF NOT EXISTS email_codes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, purpose)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Au pair candidate profile
CREATE TABLE IF NOT EXISTS aupair_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  birth_date TEXT,
  nationality TEXT,
  gender TEXT,
  languages TEXT NOT NULL DEFAULT '[]',          -- JSON [{code, level}]
  preferred_countries TEXT NOT NULL DEFAULT '[]',-- JSON [country codes]
  childcare_years REAL NOT NULL DEFAULT 0,
  age_groups TEXT NOT NULL DEFAULT '[]',         -- JSON ['infant','toddler','school','teen']
  skills TEXT NOT NULL DEFAULT '[]',             -- JSON ['first_aid','swimming','cooking',...]
  drivers_license INTEGER NOT NULL DEFAULT 0,
  non_smoker INTEGER NOT NULL DEFAULT 1,
  ok_with_pets INTEGER NOT NULL DEFAULT 1,
  available_from TEXT,
  duration_months INTEGER,
  education TEXT,
  bio TEXT,
  video_url TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  traits TEXT NOT NULL DEFAULT '[]',             -- JSON ['patient','caring',...] for the poster profile
  hobbies TEXT NOT NULL DEFAULT '[]',            -- JSON ['travel','skiing',...]
  goal TEXT,                                     -- "My goal" on the poster profile
  ideal_family TEXT,                             -- "My ideal family"
  certificates TEXT NOT NULL DEFAULT '[]'        -- JSON [{kind, detail}]: language test, CPR, first aid, ...
);

-- Host family profile
CREATE TABLE IF NOT EXISTS family_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  children TEXT NOT NULL DEFAULT '[]',           -- JSON [{age}]
  languages TEXT NOT NULL DEFAULT '[]',          -- JSON [codes spoken at home]
  required_languages TEXT NOT NULL DEFAULT '[]', -- JSON [codes au pair must speak]
  start_date TEXT,
  duration_months INTEGER,
  weekly_hours REAL,
  pocket_money REAL,                             -- per month, in country currency
  needs_driver INTEGER NOT NULL DEFAULT 0,
  has_pets INTEGER NOT NULL DEFAULT 0,
  smoking_household INTEGER NOT NULL DEFAULT 0,
  private_room INTEGER NOT NULL DEFAULT 1,
  preferred_nationalities TEXT NOT NULL DEFAULT '[]',
  bio TEXT,
  visible INTEGER NOT NULL DEFAULT 1
);

-- Swipe decisions. A like also creates (or accepts) a match_request; passes just hide the card.
CREATE TABLE IF NOT EXISTS swipes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('like','pass','super')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_id)
);

-- Interest/match workflow: pending -> accepted (both sides agreed) | declined | withdrawn
CREATE TABLE IF NOT EXISTS match_requests (
  id INTEGER PRIMARY KEY,
  from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A confirmed placement between an au pair and a family. Reviews hang off this.
CREATE TABLE IF NOT EXISTS placements (
  id INTEGER PRIMARY KEY,
  aupair_id INTEGER NOT NULL REFERENCES users(id),
  family_id INTEGER NOT NULL REFERENCES users(id),
  country TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  weekly_hours REAL NOT NULL,
  pocket_money REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','active','completed','cancelled')),
  aupair_confirmed INTEGER NOT NULL DEFAULT 0,
  family_confirmed INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS placement_tasks (
  id INTEGER PRIMARY KEY,
  placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner TEXT NOT NULL CHECK (owner IN ('aupair','family','both')),
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Two-way reviews, only allowed between participants of a placement that has started.
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  reviewee_id INTEGER NOT NULL REFERENCES users(id),
  overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  criteria TEXT NOT NULL DEFAULT '{}',           -- JSON {criterion: 1..5}
  comment TEXT,
  response TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (placement_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_user_id INTEGER REFERENCES users(id),
  review_id INTEGER REFERENCES reviews(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- People who asked to hear when the apps launch. token makes the unsubscribe link in their email.
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  role TEXT,                                      -- aupair | family, if they said
  country TEXT,
  lang TEXT,
  source TEXT,                                    -- which flyer or ad brought them (?src= on the website link)
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Family Pass: paid access for host families (messaging au pairs, seeing who liked them).
CREATE TABLE IF NOT EXISTS passes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                           -- apple | google | stripe | admin
  ref TEXT,                                       -- the store's transaction id, so a purchase is counted once
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, ref)
);
CREATE INDEX IF NOT EXISTS passes_user ON passes(user_id, ends_at);

-- Stripe Identity sessions for the ID check. Stripe keeps the documents; we keep the outcome.
CREATE TABLE IF NOT EXISTS id_checks (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,                           -- requires_input | processing | verified | canceled
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS id_checks_user ON id_checks(user_id, created_at);

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- References an au pair asks for: PairMundo emails the person a link, and they answer a short form.
CREATE TABLE IF NOT EXISTS reference_checks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  relation TEXT,                                   -- e.g. "Family I babysat for in Kraków"
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',             -- sent | confirmed | declined
  answers TEXT,                                    -- JSON {months, age_groups, recommend, rating, comment}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS reference_checks_user ON reference_checks(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS country_programs (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  visa TEXT NOT NULL,
  min_age INTEGER NOT NULL,
  max_age INTEGER NOT NULL,
  max_weekly_hours REAL NOT NULL,
  max_daily_hours REAL,
  min_pocket_money REAL,                          -- per month, local currency
  pocket_money_note TEXT,
  min_months INTEGER,
  max_months INTEGER,
  agency_required INTEGER NOT NULL DEFAULT 0,
  family_obligations TEXT NOT NULL DEFAULT '[]',  -- JSON list
  notes TEXT,
  official_source TEXT,
  last_reviewed TEXT,
  status TEXT NOT NULL DEFAULT 'open',            -- open | paused | closed
  status_note TEXT,
  eu_eea_only INTEGER NOT NULL DEFAULT 0,
  admin_edited INTEGER NOT NULL DEFAULT 0          -- set once an admin edits; seed updates then leave the row alone
);

-- Ambassadors share a referral code (on a link or typed at sign-up). People who join with it earn them rewards.
CREATE TABLE IF NOT EXISTS ambassadors (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,       -- stored in capitals; never changes, because users.ref_code points at it
  name TEXT NOT NULL,
  country TEXT,
  contact TEXT,                                   -- phone or email, for the admin only
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- their own account, so they can see their numbers in the app
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What ambassadors earned, in US cents. One row per referred person and kind, so nothing is counted twice.
CREATE TABLE IF NOT EXISTS referral_rewards (
  id INTEGER PRIMARY KEY,
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('profile','pass','placement')),
  amount_cents INTEGER NOT NULL,
  note TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ambassador_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS referral_rewards_amb ON referral_rewards(ambassador_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_requests_to ON match_requests(to_user, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
`;

export function openDb(file = process.env.DB_FILE || 'data/aupair.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Columns added after the first release, for databases created before them.
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('photos')) db.exec("ALTER TABLE users ADD COLUMN photos TEXT NOT NULL DEFAULT '[]'");
  // Accounts created before email verification existed count as verified.
  if (!cols.includes('lang')) db.exec('ALTER TABLE users ADD COLUMN lang TEXT');
  if (!cols.includes('email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0; UPDATE users SET email_verified = 1');
  const apcols = db.prepare('PRAGMA table_info(aupair_profiles)').all().map((c) => c.name);
  if (!apcols.includes('traits')) db.exec(`ALTER TABLE aupair_profiles ADD COLUMN traits TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE aupair_profiles ADD COLUMN hobbies TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE aupair_profiles ADD COLUMN goal TEXT;
    ALTER TABLE aupair_profiles ADD COLUMN ideal_family TEXT;`);
  if (!apcols.includes('certificates')) db.exec("ALTER TABLE aupair_profiles ADD COLUMN certificates TEXT NOT NULL DEFAULT '[]'");
  if (!db.prepare('PRAGMA table_info(waitlist)').all().some((c) => c.name === 'source')) db.exec('ALTER TABLE waitlist ADD COLUMN source TEXT');
  // Which flyer or ad (?src= on the website link) brought someone who signed up.
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'source')) db.exec('ALTER TABLE users ADD COLUMN source TEXT');
  // The ambassador referral code someone joined with.
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'ref_code')) db.exec('ALTER TABLE users ADD COLUMN ref_code TEXT');
  if (!db.prepare('PRAGMA table_info(waitlist)').all().some((c) => c.name === 'ref_code')) db.exec('ALTER TABLE waitlist ADD COLUMN ref_code TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS users_ref_code ON users(ref_code)');
  const pcols = db.prepare('PRAGMA table_info(country_programs)').all().map((c) => c.name);
  if (!pcols.includes('status')) {
    db.exec(`ALTER TABLE country_programs ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
      ALTER TABLE country_programs ADD COLUMN status_note TEXT;
      ALTER TABLE country_programs ADD COLUMN eu_eea_only INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE country_programs ADD COLUMN admin_edited INTEGER NOT NULL DEFAULT 0;`);
  }
  return db;
}

/** Run fn inside a transaction; rolls back on throw. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const json = {
  parse: (s, fallback = []) => {
    try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; }
  },
  str: (v) => JSON.stringify(v ?? []),
};
