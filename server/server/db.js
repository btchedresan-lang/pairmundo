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
  role TEXT NOT NULL CHECK (role IN ('aupair','family','admin','agency','ambassador','partner_manager')), -- agency, ambassador: a partner's own account, not a member others see; partner_manager: staff who run the partnerships pipeline
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
  visible INTEGER NOT NULL DEFAULT 1,
  wants_sitter TEXT                              -- onboarding question, private: 'yes' | 'maybe' | 'no' | NULL (not answered)
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  call_url TEXT                                    -- set on a "started a video call" message: the call room
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
  sort INTEGER NOT NULL DEFAULT 0,
  link TEXT                                        -- official page for a country paperwork step
);

-- The au pair agreement for a placement. Changing the terms clears both signatures.
CREATE TABLE IF NOT EXISTS placement_agreements (
  placement_id INTEGER PRIMARY KEY REFERENCES placements(id) ON DELETE CASCADE,
  terms TEXT NOT NULL DEFAULT '{}',
  aupair_signed_name TEXT, aupair_signed_at TEXT,
  family_signed_name TEXT, family_signed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Who already got the "the apps are out" email, so sending again picks up where it stopped and never repeats.
CREATE TABLE IF NOT EXISTS launch_emails (
  email TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Before launch, families on the waitlist without an account are invited to make their profile on the website, then
-- reminded once (kind: invite | reminder). One row per email and kind, so nobody gets either twice.
CREATE TABLE IF NOT EXISTS profile_invites (
  email TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, kind)
);

-- New accounts still missing a photo or bio get a nudge 2 days and 7 days after signing up (kind: day2 | day7).
CREATE TABLE IF NOT EXISTS profile_nudges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind)
);

-- Family Pass: paid access for host families (messaging au pairs, seeing who liked them).
CREATE TABLE IF NOT EXISTS passes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                           -- apple | google | stripe | admin | trial | early | gift
  ref TEXT,                                       -- the store's transaction id, so a purchase is counted once
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, ref)
);
CREATE INDEX IF NOT EXISTS passes_user ON passes(user_id, ends_at);

-- Rematch Guarantee: bought once, it covers one placement. If that placement is cancelled before the stay starts, or
-- within 6 months of the start date, the family gets a free 3-month Family Pass to find the next au pair.
CREATE TABLE IF NOT EXISTS rematch_guarantees (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                           -- app_store | play_store | stripe | admin
  ref TEXT,                                       -- the store's transaction id, so a purchase is counted once
  placement_id INTEGER REFERENCES placements(id) ON DELETE SET NULL, -- null until the family has a placement to cover
  claimed_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, ref)
);
-- Early family bonus: the first families to sign up (or join the waitlist as a family) before launch get extra free
-- days of the pass, to use whenever they choose. Keyed by email, so a waitlist spot carries over to the account.
CREATE TABLE IF NOT EXISTS early_bonus (
  email TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_at TEXT
);
-- Gift days: free days of the pass from the ambassador code a family signed up with (ambassadors.gift_days), to use
-- whenever they choose. One per email, like the early family bonus, and fixed when they sign up.
CREATE TABLE IF NOT EXISTS ref_gifts (
  email TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ambassador_id INTEGER REFERENCES ambassadors(id) ON DELETE SET NULL,
  days INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_at TEXT
);
-- "Time to look for your next au pair" nudges already sent, one per date they were worked out from.
CREATE TABLE IF NOT EXISTS search_nudges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anchor TEXT NOT NULL,                           -- placement:<id> or pass:<ends_at>
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, anchor)
);
-- Reminders already sent about a pass running out, so each one goes out once per end date.
CREATE TABLE IF NOT EXISTS pass_reminders (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ends_at TEXT NOT NULL,
  kind TEXT NOT NULL,                             -- soon | last_day | ended
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, ends_at, kind)
);

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

-- A photo or PDF of a certificate an au pair sends in for checking. Only admins see the file, and it is deleted once checked.
CREATE TABLE IF NOT EXISTS certificate_proofs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mime TEXT,
  data BLOB,
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | verified | rejected
  note TEXT,                                       -- why it was rejected, shown to the au pair
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  PRIMARY KEY (user_id, kind)
);
-- References an au pair asks for: PairMundo emails a past family a link, and they answer a short form from an account.
CREATE TABLE IF NOT EXISTS reference_checks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  relation TEXT,                                   -- e.g. "Family I babysat for in Kraków"
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',             -- sent | confirmed | declined
  answers TEXT,                                    -- JSON {months, age_groups, recommend, rating, comment}
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- the account that answered (on the invited email)
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

-- Partner offers (affiliate links) shown on checklist steps, e.g. insurance on "Arrange health, accident and liability insurance".
CREATE TABLE IF NOT EXISTS partner_offers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                             -- the partner, e.g. Wise
  slot TEXT NOT NULL,                             -- which checklist step: insurance | travel | language | arrival | sponsor
  url TEXT NOT NULL,                              -- the tracked affiliate link; people reach it through /api/partner-offers/:id/go
  blurb TEXT,                                     -- one line shown under the step
  countries TEXT NOT NULL DEFAULT '[]',           -- JSON host-country codes; empty = every country
  audience TEXT NOT NULL DEFAULT 'both',          -- aupair | family | both
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per click on a partner offer, so the admin can see which partners people use.
CREATE TABLE IF NOT EXISTS partner_clicks (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which visa documents the family has ready for a placement (the list itself comes from programs.js).
CREATE TABLE IF NOT EXISTS placement_documents (
  placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  doc_key TEXT NOT NULL,
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (placement_id, doc_key)
);

-- People who asked a partner agency for help (e.g. a US J-1 sponsor) and agreed to share their details with it.
-- Kept after the person deletes their account (user_id becomes NULL) so the agency can still be invoiced.
CREATE TABLE IF NOT EXISTS agency_referrals (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER REFERENCES partner_offers(id) ON DELETE SET NULL,
  agency TEXT NOT NULL,                           -- the partner's name when referred
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  host_country TEXT,
  code TEXT NOT NULL UNIQUE,                      -- the referral code the agency quotes back
  status TEXT NOT NULL DEFAULT 'referred',        -- referred | in_process | started | not_going
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT
);

-- When an agency's family and au pair first matched: the agency's evidence if a family later places that au pair privately.
CREATE TABLE IF NOT EXISTS agency_introductions (
  id INTEGER PRIMARY KEY,
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  family_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  aupair_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  family_name TEXT NOT NULL,                      -- kept so the record survives a deleted account
  aupair_name TEXT NOT NULL,
  how TEXT NOT NULL,                              -- match (both liked each other) | request (a match request was accepted)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ambassador_id, family_id, aupair_id)
);

-- Where each family in an agency's space is with that agency. A family without a row is a new enquiry.
CREATE TABLE IF NOT EXISTS agency_family_stages (
  family_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'enquiry',          -- enquiry | approved | matching | matched | placed | finished | not_going
  fee_paid INTEGER NOT NULL DEFAULT 0,            -- the agency's own fee, which the agency marks as paid
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Things an agency should know about in its space, e.g. contact details hidden from a chat.
CREATE TABLE IF NOT EXISTS agency_flags (
  id INTEGER PRIMARY KEY,
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  kind TEXT NOT NULL,                             -- contact (tried to share contact details before a confirmed placement)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS agency_flags_amb ON agency_flags(ambassador_id, created_at);

-- Agencies working together: a sending agency that prepares au pairs and a host agency that finds families, say.
-- Once a partnership is accepted, each one's families can meet the other's au pairs, even in closed spaces.
CREATE TABLE IF NOT EXISTS agency_partnerships (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE, -- the agency that asked
  to_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | accepted | declined | ended
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  UNIQUE (from_id, to_id)
);
-- Agencies an agency invited to join PairMundo. When the invited agency's account is linked to its code, the invite
-- becomes a partnership request from the agency that invited it.
CREATE TABLE IF NOT EXISTS agency_invites (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  message TEXT,
  joined_id INTEGER REFERENCES ambassadors(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_id, email)
);
-- Memberships an agency claims, like IAPA. Only the ones PairMundo checked show as a badge.
CREATE TABLE IF NOT EXISTS agency_affiliations (
  id INTEGER PRIMARY KEY,
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  org TEXT NOT NULL,                              -- a key of AFFILIATIONS, or 'other'
  org_name TEXT NOT NULL,                         -- the name shown on the badge
  member_ref TEXT,                                -- membership number, if the organisation gives one
  proof_url TEXT,                                 -- where PairMundo can check it, e.g. the organisation's member list
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | verified | rejected
  note TEXT,                                      -- why it was rejected, shown to the agency
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_at TEXT
);
CREATE INDEX IF NOT EXISTS agency_affiliations_amb ON agency_affiliations(ambassador_id);

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
  gift_days INTEGER NOT NULL DEFAULT 0,           -- free days of the pass for families who sign up with the code; 0 = none
  kind TEXT NOT NULL DEFAULT 'ambassador',        -- ambassador (earns rewards) | agency (a partner agency: tags its au pairs, earns nothing) | distributor (delivers flyers, paid per flyer in kr)
  invite_email TEXT,                              -- invited to create their own account; linked when they sign up and confirm this email
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

-- Flyer distributors are paid in Swedish kronor (amounts in öre): a rate per flyer for each delivery session the admin
-- logs, and a bonus for each family who joins through one of their areas' flyers (users.source or waitlist.source)
-- within a few weeks of a session there. The rate and bonus are copied onto each row, so changing them later leaves
-- what was already earned alone.
CREATE TABLE IF NOT EXISTS flyer_sessions (
  id INTEGER PRIMARY KEY,
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  area TEXT NOT NULL,                             -- the flyer's source, like door-nacka
  flyers INTEGER NOT NULL,
  rate_ore INTEGER NOT NULL,
  amount_ore INTEGER NOT NULL,
  delivered_on TEXT NOT NULL,                     -- YYYY-MM-DD
  note TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS flyer_sessions_amb ON flyer_sessions(ambassador_id, delivered_on);
-- One bonus per family email, ever: a family on the waitlist who later signs up counts once, for one distributor.
CREATE TABLE IF NOT EXISTS flyer_bonuses (
  id INTEGER PRIMARY KEY,
  ambassador_id INTEGER NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES flyer_sessions(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL,
  amount_ore INTEGER NOT NULL,
  joined_at TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The partnerships pipeline: agencies and other partners PairMundo is courting, from first research to an active
-- partner, worked by the admin and partner managers (staff with their own login who see only this).
CREATE TABLE IF NOT EXISTS partner_team (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  base_cents INTEGER NOT NULL DEFAULT 40000,      -- monthly base, US cents
  signed_cents INTEGER NOT NULL DEFAULT 4000,     -- per signed partner
  activated_cents INTEGER NOT NULL DEFAULT 8000,  -- per activated partner
  revshare_pct REAL NOT NULL DEFAULT 7,           -- % of partner revenue in a partner's first 12 months, entered by the admin
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS partner_leads (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  kind TEXT NOT NULL DEFAULT 'host',              -- host (finds families) | sending (prepares au pairs) | sponsor (e.g. US J-1) | other
  website TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  lang TEXT,                                      -- the language to write to them in
  source TEXT,                                    -- where the lead came from, e.g. wave2
  stage TEXT NOT NULL DEFAULT 'target',           -- target | contacted | replied | meeting | agreement | signed | active | declined
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- who works it and earns its commission
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_on TEXT,                            -- YYYY-MM-DD
  objection TEXT,                                 -- why they hesitated or said no, to find a way around it
  notes TEXT,
  agreement_url TEXT,                             -- the signed agreement, wherever it is kept
  onboarding_done INTEGER NOT NULL DEFAULT 0,     -- the onboarding call happened
  ambassador_id INTEGER REFERENCES ambassadors(id) ON DELETE SET NULL, -- their agency code, once they have one
  offer_id INTEGER REFERENCES partner_offers(id) ON DELETE SET NULL,   -- their referral offer, for agencies that take referrals
  contacted_at TEXT,
  replied_at TEXT,
  meeting_at TEXT,
  signed_at TEXT,
  activated_at TEXT,
  declined_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS partner_leads_stage ON partner_leads(stage, next_action_on);
CREATE INDEX IF NOT EXISTS partner_leads_email ON partner_leads(email);
CREATE TABLE IF NOT EXISTS partner_activity (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES partner_leads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL when the system did it, e.g. an automatic activation
  kind TEXT NOT NULL,                             -- note | email | reply | call | meeting | stage
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS partner_activity_lead ON partner_activity(lead_id, created_at);
-- What partner managers earned, in US cents. Signed and activated are earned once per partner, at the rate of the day;
-- revenue share and bonuses are added by the admin. Nothing is paid until the admin approves it.
CREATE TABLE IF NOT EXISTS partner_commissions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES partner_leads(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('signed','activated','revenue','bonus','adjustment')),
  amount_cents INTEGER NOT NULL,
  note TEXT,
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_commissions_once ON partner_commissions(lead_id, kind) WHERE kind IN ('signed','activated');
-- A partner manager's monthly base, recorded when the admin pays that month.
CREATE TABLE IF NOT EXISTS partner_base_pay (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                            -- YYYY-MM
  amount_cents INTEGER NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, month)
);

-- People applying for a job at PairMundo (hiring.js), from the public job page through test task and interview.
CREATE TABLE IF NOT EXISTS job_applications (
  id INTEGER PRIMARY KEY,
  job TEXT NOT NULL,                              -- a key of JOBS, e.g. partnerships-onboarding-manager
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT,
  phone TEXT,
  linkedin TEXT,
  years_b2b REAL,
  hours_ok INTEGER NOT NULL DEFAULT 0,            -- can work the hours in the job post
  languages TEXT,
  video_url TEXT,                                 -- their 2-minute introduction video
  campaign_answer TEXT,                           -- an outreach campaign they ran, with numbers
  objection_answer TEXT,                          -- how they answer the agency objection in the job post
  cv_mime TEXT,
  cv_data BLOB,                                   -- kept here, not in public photo storage; only the admin can open it
  status TEXT NOT NULL DEFAULT 'new',             -- new | shortlisted | test | interview | hired | rejected
  scores TEXT NOT NULL DEFAULT '{}',              -- JSON 1-5 per scorecard line
  notes TEXT,
  token TEXT NOT NULL UNIQUE,                     -- in the candidate's test task and interview links
  test_sent_at TEXT,
  test_answer TEXT,
  test_submitted_at TEXT,
  interview_at TEXT,                              -- UTC, 'YYYY-MM-DD HH:MM:SS'
  call_url TEXT,
  call_created_at TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- their partner manager account, once hired
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (job, email)
);

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
  if (!db.prepare('PRAGMA table_info(messages)').all().some((c) => c.name === 'call_url')) db.exec('ALTER TABLE messages ADD COLUMN call_url TEXT');
  if (!db.prepare('PRAGMA table_info(placement_tasks)').all().some((c) => c.name === 'link')) db.exec('ALTER TABLE placement_tasks ADD COLUMN link TEXT');
  if (!db.prepare('PRAGMA table_info(family_profiles)').all().some((c) => c.name === 'wants_sitter')) db.exec('ALTER TABLE family_profiles ADD COLUMN wants_sitter TEXT');
  if (!apcols.includes('certificates')) db.exec("ALTER TABLE aupair_profiles ADD COLUMN certificates TEXT NOT NULL DEFAULT '[]'");
  if (!db.prepare('PRAGMA table_info(waitlist)').all().some((c) => c.name === 'source')) db.exec('ALTER TABLE waitlist ADD COLUMN source TEXT');
  // Which flyer or ad (?src= on the website link) brought someone who signed up.
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'source')) db.exec('ALTER TABLE users ADD COLUMN source TEXT');
  // The ambassador referral code someone joined with.
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'ref_code')) db.exec('ALTER TABLE users ADD COLUMN ref_code TEXT');
  if (!db.prepare('PRAGMA table_info(waitlist)').all().some((c) => c.name === 'ref_code')) db.exec('ALTER TABLE waitlist ADD COLUMN ref_code TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS users_ref_code ON users(ref_code)');
  // Free days of the pass a code gives the families who sign up with it.
  if (!db.prepare('PRAGMA table_info(ambassadors)').all().some((c) => c.name === 'gift_days')) db.exec('ALTER TABLE ambassadors ADD COLUMN gift_days INTEGER NOT NULL DEFAULT 0');
  // Partner agencies use the same codes: their au pairs are tagged to them, and families see the agency on the profile.
  if (!db.prepare('PRAGMA table_info(ambassadors)').all().some((c) => c.name === 'kind')) db.exec("ALTER TABLE ambassadors ADD COLUMN kind TEXT NOT NULL DEFAULT 'ambassador'");
  // Someone invited to create the account that sees a code's numbers, before they have one.
  if (!db.prepare('PRAGMA table_info(ambassadors)').all().some((c) => c.name === 'invite_email')) db.exec('ALTER TABLE ambassadors ADD COLUMN invite_email TEXT');
  // Flyer distributors' pay, in öre: per flyer, per family, how long after a session a family still counts, and the
  // flyer sources (door-nacka, …) that are theirs.
  if (!db.prepare('PRAGMA table_info(ambassadors)').all().some((c) => c.name === 'flyer_rate')) {
    db.exec(`ALTER TABLE ambassadors ADD COLUMN flyer_rate INTEGER NOT NULL DEFAULT 100;
      ALTER TABLE ambassadors ADD COLUMN family_bonus INTEGER NOT NULL DEFAULT 5000;
      ALTER TABLE ambassadors ADD COLUMN bonus_days INTEGER NOT NULL DEFAULT 28;
      ALTER TABLE ambassadors ADD COLUMN areas TEXT NOT NULL DEFAULT '[]'`);
  }
  // Agency spaces: a partner agency can keep its families and au pairs to itself (closed network), hide contact details
  // in their chats until a placement is confirmed, and cover the Family Pass for its families (they pay the agency instead).
  if (!db.prepare('PRAGMA table_info(ambassadors)').all().some((c) => c.name === 'closed_network')) {
    db.exec(`ALTER TABLE ambassadors ADD COLUMN closed_network INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ambassadors ADD COLUMN mask_contacts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ambassadors ADD COLUMN covers_pass INTEGER NOT NULL DEFAULT 0`);
  }
  // An agency can approve each family before they see anyone in its space.
  if (!db.prepare('PRAGMA table_info(ambassadors)').all().some((c) => c.name === 'approve_families')) db.exec('ALTER TABLE ambassadors ADD COLUMN approve_families INTEGER NOT NULL DEFAULT 0');
  // The agency directory: whether an agency is listed, which side it works on, the countries it works with and a few words.
  if (!db.prepare('PRAGMA table_info(ambassadors)').all().some((c) => c.name === 'network_listed')) {
    db.exec(`ALTER TABLE ambassadors ADD COLUMN network_listed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ambassadors ADD COLUMN network_side TEXT;
      ALTER TABLE ambassadors ADD COLUMN network_countries TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE ambassadors ADD COLUMN network_about TEXT;
      ALTER TABLE ambassadors ADD COLUMN website TEXT`);
  }
  // Which partner agency an introduction came through, when the family and the au pair are with different agencies.
  if (!db.prepare('PRAGMA table_info(agency_introductions)').all().some((c) => c.name === 'partner_name')) db.exec('ALTER TABLE agency_introductions ADD COLUMN partner_name TEXT');
  // An agency's email for referrals: offers with one get a "Get help" button that sends the person's details there.
  if (!db.prepare('PRAGMA table_info(partner_offers)').all().some((c) => c.name === 'lead_email')) db.exec('ALTER TABLE partner_offers ADD COLUMN lead_email TEXT');
  // The family's street address, for the visa invitation letter.
  if (!db.prepare('PRAGMA table_info(placements)').all().some((c) => c.name === 'host_address')) db.exec('ALTER TABLE placements ADD COLUMN host_address TEXT');
  // Past-family references are answered from an account now; this is the account that answered.
  if (!db.prepare('PRAGMA table_info(reference_checks)').all().some((c) => c.name === 'reviewer_id')) db.exec('ALTER TABLE reference_checks ADD COLUMN reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
  const pcols = db.prepare('PRAGMA table_info(country_programs)').all().map((c) => c.name);
  if (!pcols.includes('status')) {
    db.exec(`ALTER TABLE country_programs ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
      ALTER TABLE country_programs ADD COLUMN status_note TEXT;
      ALTER TABLE country_programs ADD COLUMN eu_eea_only INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE country_programs ADD COLUMN admin_edited INTEGER NOT NULL DEFAULT 0;`);
  }
  // Partner agencies got their own accounts. The role check only gets wider, so the rows already there still pass it,
  // and SQLite lets the stored table definition be edited in place instead of copying the table.
  const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
  if (usersSql.includes("role IN ('aupair','family','admin'))")) {
    const v = db.prepare('PRAGMA schema_version').get().schema_version;
    db.exec('PRAGMA writable_schema = ON');
    db.prepare("UPDATE sqlite_master SET sql = replace(sql, ?, ?) WHERE type = 'table' AND name = 'users'")
      .run("role IN ('aupair','family','admin'))", "role IN ('aupair','family','admin','agency'))");
    db.exec(`PRAGMA schema_version = ${v + 1}; PRAGMA writable_schema = OFF;`);
  }
  // Ambassadors who are neither au pairs nor families got their own accounts too, the same way.
  const usersSql2 = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
  if (usersSql2.includes("role IN ('aupair','family','admin','agency'))")) {
    const v = db.prepare('PRAGMA schema_version').get().schema_version;
    db.exec('PRAGMA writable_schema = ON');
    db.prepare("UPDATE sqlite_master SET sql = replace(sql, ?, ?) WHERE type = 'table' AND name = 'users'")
      .run("role IN ('aupair','family','admin','agency'))", "role IN ('aupair','family','admin','agency','ambassador'))");
    db.exec(`PRAGMA schema_version = ${v + 1}; PRAGMA writable_schema = OFF;`);
  }
  // Partner managers (staff who run the partnerships pipeline) got their own accounts, the same way.
  const usersSql3 = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
  if (usersSql3.includes("role IN ('aupair','family','admin','agency','ambassador'))")) {
    const v = db.prepare('PRAGMA schema_version').get().schema_version;
    db.exec('PRAGMA writable_schema = ON');
    db.prepare("UPDATE sqlite_master SET sql = replace(sql, ?, ?) WHERE type = 'table' AND name = 'users'")
      .run("role IN ('aupair','family','admin','agency','ambassador'))", "role IN ('aupair','family','admin','agency','ambassador','partner_manager'))");
    db.exec(`PRAGMA schema_version = ${v + 1}; PRAGMA writable_schema = OFF;`);
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
