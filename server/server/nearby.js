// Nearby: au pairs meet other au pairs, and families other families, in the city they live in, and anyone can join
// group meetups in public places (coffee, walks, playdates). Partner agencies host official meetups for their people,
// and the admin lists meetups from elsewhere that link out.
//
// Privacy and safety, because many au pairs are young and new in the country:
// - Off until the person turns it on, and turning it off forgets their city and point.
// - Only the city and, if shared, a point rounded to a ~2 km grid are kept. Others see a distance band, never a pin.
// - A city shows its people only once enough of them are on Nearby (NEARBY_MIN_PEOPLE, default 5), so nobody is
//   the only au pair on the map of a small town. You only see others while you are visible yourself.
// - Au pairs meet au pairs and families meet families. Families find au pairs nearby only if the au pair ticks
//   "Let families near me find me".
// - Meetups are in public places, the exact spot is shown only to people going, members need a confirmed email and a
//   profile to join and an ID check to host, and three reports hide a meetup until the admin looks at it.
// - At a meetup, people check in by scanning the QR code the host shows (or typing its code), and those who checked in
//   can rate it for a few days after. Community Managers (community.js) are paid on these check-ins and ratings.

import { randomInt } from 'node:crypto';
import QRCode from 'qrcode';

const GRID = 0.02; // degrees, about 2.2 km north-south
const NEAR_KM = 30; // people this close count as the same city, so suburbs under another name join the big city
const ACTIVE_DAYS = 30;
const MAX_HOSTED = 3; // upcoming meetups a member can host at once
const HELLOS_PER_DAY = 20;
const REPORTS_TO_HIDE = 3;
export const MEETUP_KINDS = ['coffee', 'walk', 'picnic', 'playdate', 'sport', 'language', 'culture', 'other'];
// Check-in codes leave out letters and digits that look alike (0/O, 1/I/L).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCheckinCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
const CHECKIN_BEFORE_MS = 30 * 60e3; // check-in opens 30 minutes before the start
const CHECKIN_AFTER_MS = 60 * 60e3;  // and closes an hour after the end (or 4 hours after the start, without an end)
/** When check-in at a meetup opens and closes, in ms. */
export const checkinWindow = (m) => {
  const start = Date.parse(m.starts_at);
  const end = m.ends_at ? Date.parse(m.ends_at) : start + 3 * 3600e3;
  return { opens: start - CHECKIN_BEFORE_MS, closes: end + CHECKIN_AFTER_MS };
};
/** When ratings close: rating_days after the start. */
export const ratingCloses = (m, days) => Date.parse(m.starts_at) + days * 86400e3;
const minPeople = () => Math.max(1, Number(process.env.NEARBY_MIN_PEOPLE) || 5);
// Hosting a member meetup needs an ID check, unless NEARBY_HOST_ID=off.
const hostNeedsId = () => process.env.NEARBY_HOST_ID !== 'off';

/** "Malmö " → "malmo": cities match without case, accents or punctuation. */
export const cityKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
/** Snaps a coordinate to the grid, so the exact spot is never stored. */
export const toGrid = (v, max) => {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n) || Math.abs(n) > max) return null;
  return Number((Math.round(n / GRID) * GRID).toFixed(2));
};
export const distanceKm = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const hasPoint = (a) => a?.lat != null && a?.lng != null;
/** How far, as a band the apps show ("under 5 km"), or null for "in your city". */
export const distanceBand = (a, b) => {
  if (!hasPoint(a) || !hasPoint(b)) return null;
  const km = distanceKm(a, b);
  return [3, 5, 10, 25].find((x) => km < x) ?? null;
};
/** Same city, or both shared a point and they are within radius km (a suburb under another name). */
export const isNear = (a, b, radius = 30) => !!a && !!b && a.country === b.country
  && (a.city_key === b.city_key || (hasPoint(a) && hasPoint(b) && distanceKm(a, b) <= radius));
// Meetups are for public places. This catches the obvious "come to my flat" in the languages the app speaks.
const PRIVATE_PLACE = /\b(my|our) (home|place|flat|apartment|house|room)\b|\bat home\b|\bhemma\b|\bhos (mig|oss)\b|\bzu ?hause\b|\bbei (mir|uns)\b|\bchez (moi|nous)\b|\b(mi|nuestra) casa\b|\ben casa\b|\bminha casa\b|\bem casa\b/i;

export function mountNearby(api, deps) {
  const { db, wrap, requireAuth, requireRole, HttpError, str, tx, notify, publicUser, getUser, getProfile, blockedBetween, closedApart,
    conversationFor, mustBeReady, mustBeVerified, agencySpace, shortName, photosOf, publicBase, communityManagerOf, logCommunity, geo } = deps;
  /** Records what a Community Manager did to one of their meetups, for the admin's activity log. */
  const track = (m, u, action, detail) => { if (m.source === 'community' && m.host_id === u.id) logCommunity?.(u.id, m.id, action, detail); };
  const ratingDays = () => db.prepare('SELECT rating_days FROM community_rules WHERE id = 1').get()?.rating_days ?? 3;
  const bad = (m, code) => new HttpError(400, m, code);
  const notFound = () => new HttpError(404, 'Not found.');
  const now = () => new Date().toISOString();
  const member = requireRole('aupair', 'family');

  const areaOf = (userId) => db.prepare('SELECT * FROM nearby_settings WHERE user_id = ?').get(userId) ?? null;
  const settingsView = (n) => n && ({ city: n.city, country: n.country, approximate: hasPoint(n), visible: !!n.visible, families_can_find: !!n.families_can_find });
  /** Agency a user's account runs, if any. */
  const myAgency = (u) => (u.role === 'agency' ? db.prepare("SELECT * FROM ambassadors WHERE user_id = ? AND kind = 'agency' AND active = 1").get(u.id) ?? null : null);

  // ---------- your Nearby settings ----------
  api.put('/me/nearby', member, wrap((req) => {
    const me = req.user;
    mustBeVerified(me);
    const b = req.body || {};
    const city = str(b.city, 80);
    const country = String(b.country || me.country || '').toUpperCase();
    if (!city || !cityKey(city)) throw bad('Tell us which city you live in.');
    if (!/^[A-Z]{2}$/.test(country)) throw bad('Pick your country.');
    const prev = areaOf(me.id);
    // A point is kept while the city stays the same, unless the app sends a new one (or null to clear it).
    const keep = !('lat' in b) && prev && prev.city_key === cityKey(city) && prev.country === country;
    const lat = keep ? prev.lat : toGrid(b.lat, 90), lng = keep ? prev.lng : toGrid(b.lng, 180);
    const visible = b.visible == null ? (prev ? prev.visible : 1) : (b.visible ? 1 : 0);
    // Families finding an au pair is something the au pair turns on themselves; it starts off.
    const findable = me.role === 'aupair' && (b.families_can_find == null ? !!prev?.families_can_find : !!b.families_can_find) ? 1 : 0;
    db.prepare(`INSERT INTO nearby_settings (user_id, city, city_key, country, lat, lng, visible, families_can_find, updated_at)
      VALUES (?,?,?,?,?,?,?,?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET city = excluded.city, city_key = excluded.city_key,
      country = excluded.country, lat = excluded.lat, lng = excluded.lng, visible = excluded.visible, families_can_find = excluded.families_can_find,
      updated_at = excluded.updated_at`).run(me.id, city, cityKey(city), country, lat, lng, visible, findable);
    return { settings: settingsView(areaOf(me.id)) };
  }));
  // Turning Nearby off forgets the city and point. Hellos and meetups already joined stay.
  api.delete('/me/nearby', member, wrap((req) => {
    db.prepare('DELETE FROM nearby_settings WHERE user_id = ?').run(req.user.id);
    return { settings: null };
  }));

  // ---------- people nearby ----------
  /** People of role in the same city, or within NEAR_KM when both shared a point (Solna and Nacka count for Stockholm),
   *  who are on Nearby and visible, active lately and in good standing. */
  const cityPeople = (area, role, demo) => db.prepare(`SELECT u.*, n.lat, n.lng, n.city_key, n.country FROM nearby_settings n JOIN users u ON u.id = n.user_id
      WHERE n.country = ? AND (n.city_key = ? OR (? AND n.lat IS NOT NULL AND n.lng IS NOT NULL)) AND n.visible = 1 AND u.role = ?
        AND u.suspended = 0 AND u.email_verified = 1 AND u.demo = ? AND u.last_active_at >= datetime('now', ?)`)
    .all(area.country, area.city_key, hasPoint(area) ? 1 : 0, role, demo ? 1 : 0, `-${ACTIVE_DAYS} days`)
    .filter((u) => isNear(area, u, NEAR_KM));
  const helloBetween = (a, b) => db.prepare(`SELECT * FROM nearby_hellos WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
      ORDER BY status = 'accepted' DESC, id DESC LIMIT 1`).get(a, b, b, a);
  const helloState = (me, otherId) => {
    const h = helloBetween(me, otherId);
    if (!h || h.status === 'declined') return h?.from_user === me ? 'sent' : 'none'; // a declined hello looks still pending to the sender
    if (h.status === 'accepted') return 'connected';
    return h.from_user === me ? 'sent' : 'received';
  };
  /** A few words under someone's name: where an au pair is from and what they speak; how many children a family has. */
  const blurb = (u) => {
    const p = getProfile(u);
    if (!p) return {};
    return u.role === 'aupair' ? { nationality: p.nationality || null, languages: (p.languages || []).map((l) => l.code).slice(0, 4), age: p.age ?? null }
      : { children: (p.children || []).length, languages: (p.languages || []).slice(0, 4) };
  };
  const canMeet = (me, u) => u.id !== me.id && !blockedBetween(me.id, u.id) && !closedApart(me, u) && photosOf(u).length > 0;

  // ---------- meetups ----------
  const getMeetup = (id) => db.prepare('SELECT * FROM meetups WHERE id = ?').get(Number(id));
  const goingCount = (m) => db.prepare('SELECT COUNT(*) n FROM meetup_attendees WHERE meetup_id = ?').get(m.id).n;
  const isGoing = (m, uid) => !!db.prepare('SELECT 1 FROM meetup_attendees WHERE meetup_id = ? AND user_id = ?').get(m.id, uid);
  const runsIt = (m, u) => (m.host_id && m.host_id === u.id) || (m.agency_id && myAgency(u)?.id === m.agency_id) || u.role === 'admin';
  /** Whether a member may see a meetup at all (in a list or by its link). */
  const canSee = (m, u) => {
    if (runsIt(m, u)) return true;
    if (m.status !== 'open' && !isGoing(m, u.id)) return false;
    if (!!m.demo !== !!u.demo) return false;
    if (!['aupair', 'family'].includes(u.role) || (m.audience !== 'both' && m.audience !== u.role)) return false;
    if (m.agency_only && agencySpace(u)?.id !== m.agency_id) return false;
    if (m.host_id && blockedBetween(m.host_id, u.id)) return false;
    return true;
  };
  const meetupView = (m, u, full = false) => {
    const going = isGoing(m, u.id), runs = runsIt(m, u);
    const host = m.host_id ? getUser(m.host_id) : null;
    const agency = m.agency_id ? db.prepare('SELECT name FROM ambassadors WHERE id = ?').get(m.agency_id) : null;
    const insider = going || runs || m.source === 'external';
    const community = m.source === 'community';
    const v = {
      id: m.id, source: m.source, official: m.source === 'agency', external: m.source === 'external', community, kind: m.kind, title: m.title, about: m.about,
      city: m.city, country: m.country, area: m.area, starts_at: m.starts_at, ends_at: m.ends_at, started: m.starts_at < now(), audience: m.audience, agency_only: !!m.agency_only,
      max_people: m.max_people, going: goingCount(m), status: m.status, i_am_going: going, i_host: !!runs && u.role !== 'admin',
      // A Community Manager isn't a member with a profile: they show by first name, as PairMundo's host for the city.
      host: host && !community ? publicUser(host, u) : null, community_host: community && host ? shortName(host.name) : null,
      agency: agency?.name ?? null, organizer: m.organizer, external_url: m.external_url,
      // The exact spot is for people going; everyone else sees the neighbourhood, and a map pin rounded to the grid.
      place: insider ? m.place : null,
      point: m.lat == null ? null : insider ? { lat: m.lat, lng: m.lng, exact: true } : { lat: toGrid(m.lat, 90), lng: toGrid(m.lng, 180), exact: false },
    };
    if (m.source !== 'external') {
      const t = Date.now(), w = checkinWindow(m);
      const mine = db.prepare('SELECT newcomer FROM meetup_checkins WHERE meetup_id = ? AND user_id = ?').get(m.id, u.id);
      v.checked_in = !!mine;
      v.check_in_open = m.status === 'open' && t >= w.opens && t <= w.closes && !runs;
      if (mine) {
        v.my_rating = db.prepare('SELECT stars FROM meetup_ratings WHERE meetup_id = ? AND user_id = ?').get(m.id, u.id)?.stars ?? null;
        v.can_rate = m.status !== 'cancelled' && t >= Date.parse(m.starts_at) && t <= ratingCloses(m, ratingDays());
      }
      // The host shows the code as a QR code at the meetup; scanning it opens the check-in page.
      if (runs && full) {
        const code = codeOf(m);
        const c = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(newcomer), 0) newcomers FROM meetup_checkins WHERE meetup_id = ?').get(m.id);
        const r = db.prepare('SELECT COUNT(*) n, AVG(stars) avg FROM meetup_ratings WHERE meetup_id = ?').get(m.id);
        v.checkin = { code, url: `${publicBase()}/#/checkin/${m.id}/${code}`, qr: `/api/meetups/${m.id}/qr.svg`, opens_at: new Date(w.opens).toISOString(), closes_at: new Date(w.closes).toISOString(),
          count: c.n, newcomers: c.newcomers, ratings: r.n, rating: r.avg == null ? null : Math.round(r.avg * 10) / 10 };
      }
    }
    if (full && (going || runs)) {
      v.attendees = db.prepare('SELECT u.* FROM meetup_attendees a JOIN users u ON u.id = a.user_id WHERE a.meetup_id = ? ORDER BY a.created_at')
        .all(m.id).filter((x) => x.id === u.id || !blockedBetween(x.id, u.id)).map((x) => publicUser(x, u));
    }
    return v;
  };
  /** Upcoming meetups in an area that this member may see, soonest first. Meetups that started up to 3 hours ago still show. */
  const meetupsIn = (area, u) => {
    const since = new Date(Date.now() - 3 * 3600e3).toISOString();
    return db.prepare(`SELECT * FROM meetups WHERE country = ? AND city_key = ? AND starts_at >= ? AND status = 'open' ORDER BY starts_at LIMIT 100`)
      .all(area.country, area.city_key, since).filter((m) => canSee(m, u)).slice(0, 50).map((m) => meetupView(m, u));
  };
  const mine = (u) => {
    const since = new Date(Date.now() - 3 * 3600e3).toISOString();
    return db.prepare(`SELECT m.* FROM meetups m WHERE m.starts_at >= ? AND m.status != 'hidden' AND (m.host_id = ? OR EXISTS
        (SELECT 1 FROM meetup_attendees a WHERE a.meetup_id = m.id AND a.user_id = ?)) ORDER BY m.starts_at`).all(since, u.id, u.id)
      .map((m) => meetupView(m, u));
  };

  /** Everything the Nearby screen shows. */
  api.get('/nearby', member, wrap((req) => {
    const me = req.user;
    const area = areaOf(me.id);
    const hostRule = hostNeedsId() && !me.id_verified ? 'id' : null;
    if (!area) return { settings: null, min_people: minPeople(), host_rule: hostRule, my_meetups: mine(me) };
    const all = cityPeople(area, me.role, me.demo);
    const count = all.length;
    const unlocked = count >= minPeople();
    // You see others only while they can see you.
    const people = unlocked && area.visible ? all.filter((u) => canMeet(me, u)).map((u) => ({
      user: publicUser(u, me), distance: distanceBand(area, u), ...blurb(u), hello: helloState(me.id, u.id),
    })).sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99) || String(b.user.last_active_at).localeCompare(String(a.user.last_active_at))) : [];
    const hellos = db.prepare("SELECT * FROM nearby_hellos WHERE to_user = ? AND status = 'pending' ORDER BY id DESC").all(me.id)
      .map((h) => ({ h, u: getUser(h.from_user) })).filter(({ u }) => u && !u.suspended && canMeet(me, u))
      .map(({ h, u }) => ({ id: h.id, message: h.message, created_at: h.created_at, user: publicUser(u, me), ...blurb(u) }));
    return {
      settings: settingsView(area),
      city: { name: area.city, country: area.country, people: count, needed: Math.max(0, minPeople() - count), unlocked },
      min_people: minPeople(), people, hellos, meetups: meetupsIn(area, me), my_meetups: mine(me), host_rule: hostRule,
    };
  }));

  api.post('/nearby/people/:id/hello', member, wrap((req, res) => {
    const me = req.user;
    mustBeReady(me);
    const area = areaOf(me.id);
    if (!area?.visible) throw bad('Turn on Nearby and show yourself to others first.', 'nearby_off');
    const t = getUser(req.params.id);
    const theirs = t && areaOf(t.id);
    if (!t || t.role !== me.role || t.suspended || !theirs?.visible || !isNear(area, theirs, NEAR_KM) || !canMeet(me, t)) throw notFound();
    if (cityPeople(area, me.role, me.demo).length < minPeople()) throw notFound();
    const prev = helloBetween(me.id, t.id);
    if (prev?.status === 'accepted') return { status: 'connected', conversation_id: conversationFor(me.id, t.id, true).id };
    // They already said hi to me (even if I said no thanks then): saying hi back connects us.
    if (prev && prev.from_user === t.id) return acceptHello(prev, me);
    if (prev) return { status: 'sent' };
    const today = db.prepare("SELECT COUNT(*) n FROM nearby_hellos WHERE from_user = ? AND created_at >= datetime('now', '-1 day')").get(me.id).n;
    if (today >= HELLOS_PER_DAY) throw new HttpError(429, 'You said hi to a lot of people today. Try again tomorrow.');
    db.prepare('INSERT INTO nearby_hellos (from_user, to_user, message) VALUES (?,?,?)').run(me.id, t.id, str(req.body?.message, 300) || null);
    notify(t.id, 'nearby', me.role === 'aupair' ? '{name}, an au pair near you, said hi. Open Nearby to answer.' : '{name}, a family near you, said hi. Open Nearby to answer.',
      { name: shortName(me.name) }, '#/nearby');
    res.status(201);
    return { status: 'sent' };
  }));
  const acceptHello = (h, me) => {
    const c = tx(db, () => {
      db.prepare("UPDATE nearby_hellos SET status = 'accepted', responded_at = datetime('now') WHERE id = ?").run(h.id);
      const conv = conversationFor(h.from_user, h.to_user, true);
      if (h.message && !db.prepare('SELECT 1 FROM messages WHERE conversation_id = ?').get(conv.id)) {
        db.prepare('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?,?,?,?)').run(conv.id, h.from_user, h.message, h.created_at);
      }
      return conv;
    });
    notify(h.from_user, 'nearby', '{name} said hi back. You can chat now.', { name: shortName(me.name) }, `#/messages/${c.id}`);
    return { status: 'connected', conversation_id: c.id };
  };
  api.post('/nearby/hellos/:id', member, wrap((req) => {
    const me = req.user;
    const h = db.prepare("SELECT * FROM nearby_hellos WHERE id = ? AND to_user = ? AND status = 'pending'").get(Number(req.params.id), me.id);
    const from = h && getUser(h.from_user);
    if (!h || !from || !canMeet(me, from)) throw notFound();
    if (!req.body?.accept) {
      // The sender isn't told: their hello just stays unanswered.
      db.prepare("UPDATE nearby_hellos SET status = 'declined', responded_at = datetime('now') WHERE id = ?").run(h.id);
      return { status: 'declined' };
    }
    mustBeVerified(me);
    return acceptHello(h, me);
  }));

  // ---------- hosting and joining meetups ----------
  const readMeetup = (b, { maxPeople, minLeadMs }) => {
    const title = str(b.title, 80);
    if (!title || title.length < 3) throw bad('Give the meetup a short title.');
    const kind = MEETUP_KINDS.includes(b.kind) ? b.kind : 'other';
    const place = str(b.place, 120);
    if (!place || place.length < 3) throw bad('Say which public place you meet at, like a café, a park or a library.');
    if (PRIVATE_PLACE.test(place) || PRIVATE_PLACE.test(String(b.about || ''))) throw bad('Meetups are in public places only, like a café, a park or a library. Never at someone\'s home.', 'public_place');
    const start = new Date(String(b.starts_at || ''));
    if (Number.isNaN(start.getTime())) throw bad('Pick a date and time.');
    if (start.getTime() < Date.now() + minLeadMs) throw bad('Pick a time at least an hour from now.');
    if (start.getTime() > Date.now() + 90 * 86400e3) throw bad('Pick a date in the next 3 months.');
    let end = null;
    if (b.ends_at) {
      const e = new Date(String(b.ends_at));
      if (Number.isNaN(e.getTime()) || e <= start) throw bad('The end must be after the start.');
      end = e.toISOString();
    }
    const n = b.max_people == null || b.max_people === '' ? null : Math.round(Number(b.max_people));
    if (n != null && !(n >= 2 && n <= maxPeople)) throw bad(`Up to ${maxPeople} people can come.`);
    // Where the public place is, for the map (about 10 m is plenty).
    const coord = (v, max) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) || Math.abs(x) > max ? null : Number(x.toFixed(4)); };
    const lat = coord(b.lat, 90), lng = coord(b.lng, 180);
    return { title, kind, place, about: str(b.about, 1000) || null, area: str(b.area, 80) || null, starts_at: start.toISOString(), ends_at: end, max_people: n,
      lat: lat != null && lng != null ? lat : null, lng: lat != null && lng != null ? lng : null };
  };
  /** A meetup's check-in code, made the first time it's needed for meetups from before check-ins. */
  const codeOf = (m) => {
    if (m.checkin_code) return m.checkin_code;
    m.checkin_code = newCheckinCode();
    db.prepare('UPDATE meetups SET checkin_code = ? WHERE id = ?').run(m.checkin_code, m.id);
    return m.checkin_code;
  };
  const insertMeetup = (m) => {
    if (m.source !== 'external') m.checkin_code = newCheckinCode();
    const cols = Object.keys(m);
    const id = Number(db.prepare(`INSERT INTO meetups (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((k) => m[k])).lastInsertRowid);
    return getMeetup(id);
  };
  const cityOf = (b) => {
    const city = str(b.city, 80);
    const country = String(b.country || '').toUpperCase();
    if (!city || !cityKey(city)) throw bad('Which city is the meetup in?');
    if (!/^[A-Z]{2}$/.test(country)) throw bad('Pick the country.');
    return { city, city_key: cityKey(city), country };
  };

  api.post('/meetups', requireAuth, wrap((req, res) => {
    const me = req.user, b = req.body || {};
    let m;
    if (me.role === 'aupair' || me.role === 'family') {
      mustBeReady(me);
      if (hostNeedsId() && !me.id_verified) throw new HttpError(403, 'Verify your ID to host meetups. Anyone can join one.', 'id_required');
      const area = areaOf(me.id);
      if (!area) throw bad('Turn on Nearby first, so we know your city.', 'nearby_off');
      if (b.public_place !== true) throw bad('Confirm the meetup is in a public place.', 'public_place');
      const hosted = db.prepare("SELECT COUNT(*) n FROM meetups WHERE host_id = ? AND status = 'open' AND starts_at >= ?").get(me.id, now()).n;
      if (hosted >= MAX_HOSTED) throw bad(`You can host up to ${MAX_HOSTED} upcoming meetups at a time.`);
      m = { source: 'member', host_id: me.id, audience: me.role, ...readMeetup(b, { maxPeople: 30, minLeadMs: 3600e3 }),
        city: area.city, city_key: area.city_key, country: area.country };
      if (m.max_people == null) m.max_people = 8;
    } else if (me.role === 'agency') {
      const a = myAgency(me);
      if (!a) throw new HttpError(403, 'Not allowed.');
      if (b.public_place !== true) throw bad('Confirm the meetup is in a public place.', 'public_place');
      const audience = ['aupair', 'family', 'both'].includes(b.audience) ? b.audience : 'aupair';
      m = { source: 'agency', host_id: me.id, agency_id: a.id, audience, agency_only: b.agency_only === false ? 0 : 1,
        ...readMeetup(b, { maxPeople: 300, minLeadMs: 0 }), ...cityOf(b), demo: a.demo ? 1 : 0 };
    } else if (me.role === 'ambassador' && communityManagerOf?.(me)) {
      // A Community Manager hosts in their own city, for au pairs, families or both.
      const cm = communityManagerOf(me);
      if (b.public_place !== true) throw bad('Confirm the meetup is in a public place.', 'public_place');
      const audience = ['aupair', 'family', 'both'].includes(b.audience) ? b.audience : 'both';
      m = { source: 'community', host_id: me.id, audience, ...readMeetup(b, { maxPeople: 300, minLeadMs: 3600e3 }), city: cm.city, city_key: cm.city_key, country: cm.country };
    } else if (me.role === 'admin') {
      // A meetup from elsewhere (an expat group, a library language café), linking out to where people sign up.
      const url = str(b.external_url, 500);
      if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(url || '')) throw bad('Add the https link where people sign up.');
      const organizer = str(b.organizer, 80);
      if (!organizer) throw bad('Who organises it?');
      const audience = ['aupair', 'family', 'both'].includes(b.audience) ? b.audience : 'both';
      m = { source: 'external', audience, external_url: url, organizer, ...readMeetup(b, { maxPeople: 10000, minLeadMs: 0 }), ...cityOf(b) };
    } else throw new HttpError(403, 'Not allowed.');
    m.created_by = me.id;
    if (me.demo) m.demo = 1;
    const saved = insertMeetup(m);
    track(saved, me, 'created', { title: saved.title, starts_at: saved.starts_at, place: saved.place, audience: saved.audience });
    if (saved.source === 'community') {
      // Everyone on Nearby in the city it's for hears about it: that's how a community grows.
      const roles = saved.audience === 'both' ? ['aupair', 'family'] : [saved.audience];
      for (const u of db.prepare(`SELECT u.id FROM nearby_settings n JOIN users u ON u.id = n.user_id WHERE n.country = ? AND n.city_key = ?
          AND u.role IN (${roles.map(() => '?').join(',')}) AND u.suspended = 0 AND u.demo = ?`).all(saved.country, saved.city_key, ...roles, saved.demo ? 1 : 0)) {
        notify(u.id, 'nearby', 'New PairMundo meetup in {city}: {title}', { city: saved.city, title: saved.title }, `#/meetups/${saved.id}`);
      }
    }
    if (saved.source === 'agency') {
      // The agency's own people in that city hear about it.
      const a = myAgency(me);
      const roles = saved.audience === 'both' ? ['aupair', 'family'] : [saved.audience];
      for (const u of db.prepare(`SELECT u.id, u.city, n.city_key FROM users u LEFT JOIN nearby_settings n ON n.user_id = u.id
          WHERE u.ref_code = ? AND u.role IN (${roles.map(() => '?').join(',')}) AND u.suspended = 0 AND u.country = ?`).all(a.code, ...roles, saved.country)) {
        if ((u.city_key || cityKey(u.city)) === saved.city_key) {
          notify(u.id, 'nearby', '{agency} invited you to a meetup in {city}: {title}', { agency: a.name, city: saved.city, title: saved.title }, `#/meetups/${saved.id}`);
        }
      }
    }
    res.status(201);
    return { meetup: meetupView(saved, me, true) };
  }));

  const seeMeetup = (req) => {
    const m = getMeetup(req.params.id);
    if (!m || !canSee(m, req.user)) throw notFound();
    return m;
  };
  api.get('/meetups/:id', requireAuth, wrap((req) => ({ meetup: meetupView(seeMeetup(req), req.user, true) })));

  api.post('/meetups/:id/join', member, wrap((req) => {
    const me = req.user, m = seeMeetup(req);
    mustBeReady(me);
    if (m.source === 'external') throw bad('This meetup is organised elsewhere. Use its link to sign up.');
    if (m.status !== 'open' || m.starts_at < now()) throw bad('This meetup is no longer open.');
    if (m.host_id === me.id) return { meetup: meetupView(m, me, true) };
    if (!isGoing(m, me.id)) {
      if (m.max_people && goingCount(m) >= m.max_people) throw bad('This meetup is full.');
      db.prepare('INSERT INTO meetup_attendees (meetup_id, user_id) VALUES (?,?)').run(m.id, me.id);
      if (m.host_id) notify(m.host_id, 'nearby', '{name} is coming to {title}.', { name: shortName(me.name), title: m.title }, `#/meetups/${m.id}`);
    }
    return { meetup: meetupView(m, me, true) };
  }));
  api.delete('/meetups/:id/join', member, wrap((req) => {
    const m = getMeetup(req.params.id);
    if (!m) throw notFound();
    db.prepare('DELETE FROM meetup_attendees WHERE meetup_id = ? AND user_id = ?').run(m.id, req.user.id);
    return { ok: true };
  }));
  api.post('/meetups/:id/cancel', requireAuth, wrap((req) => {
    const m = getMeetup(req.params.id);
    if (!m || !runsIt(m, req.user)) throw notFound();
    if (m.status === 'cancelled') return { ok: true };
    db.prepare("UPDATE meetups SET status = 'cancelled' WHERE id = ?").run(m.id);
    for (const a of db.prepare('SELECT user_id FROM meetup_attendees WHERE meetup_id = ?').all(m.id)) {
      notify(a.user_id, 'nearby', '{title} was cancelled.', { title: m.title }, `#/meetups/${m.id}`);
    }
    track(m, req.user, 'cancelled', { title: m.title, going: goingCount(m) });
    return { ok: true };
  }));

  // The host changes a meetup that hasn't started: what, when, where and for whom. The city stays. People going hear
  // about a new time or place.
  api.put('/meetups/:id', requireAuth, wrap((req) => {
    const me = req.user, m = getMeetup(req.params.id), b = req.body || {};
    if (!m || m.source === 'external' || !runsIt(m, me) || me.role === 'admin') throw notFound();
    if (m.status !== 'open') throw bad('Only open meetups can be changed.');
    if (Date.parse(m.starts_at) <= Date.now()) throw bad('This meetup has already started, so it can no longer be changed.');
    if (b.public_place !== true) throw bad('Confirm the meetup is in a public place.', 'public_place');
    const sameStart = new Date(String(b.starts_at || '')).getTime() === Date.parse(m.starts_at);
    const next = readMeetup(b, { maxPeople: m.source === 'member' ? 30 : 300, minLeadMs: sameStart ? -Infinity : (m.source === 'agency' ? 0 : 3600e3) });
    if (m.source === 'member') next.audience = m.audience;
    else next.audience = ['aupair', 'family', 'both'].includes(b.audience) ? b.audience : m.audience;
    if (m.source === 'member' && next.max_people == null) next.max_people = m.max_people;
    if (next.max_people && goingCount(m) > next.max_people) throw bad(`${goingCount(m)} people are already going, so allow at least that many.`);
    const changed = Object.keys(next).filter((k) => String(next[k] ?? '') !== String(m[k] ?? ''));
    if (changed.length) {
      db.prepare(`UPDATE meetups SET ${changed.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...changed.map((k) => next[k]), m.id);
      if (changed.some((k) => ['starts_at', 'ends_at', 'place'].includes(k))) {
        for (const a of db.prepare('SELECT user_id FROM meetup_attendees WHERE meetup_id = ?').all(m.id)) {
          notify(a.user_id, 'nearby', '{title} has a new time or place. Check the details.', { title: next.title }, `#/meetups/${m.id}`);
        }
      }
      track(m, me, 'edited', Object.fromEntries(changed.map((k) => [k, { from: m[k] ?? null, to: next[k] ?? null }])));
    }
    return { meetup: meetupView(getMeetup(m.id), me, true) };
  }));

  // The meetup's group chat: the host and the people going.
  const inChat = (req) => {
    const m = seeMeetup(req);
    if (!(isGoing(m, req.user.id) || runsIt(m, req.user))) throw new HttpError(403, 'Join the meetup to see its chat.');
    return m;
  };
  api.get('/meetups/:id/messages', requireAuth, wrap((req) => {
    const m = inChat(req);
    const after = Number(req.query.after) || 0;
    return {
      messages: db.prepare('SELECT * FROM meetup_messages WHERE meetup_id = ? AND id > ? ORDER BY id LIMIT 300').all(m.id, after)
        .filter((x) => x.sender_id === req.user.id || !blockedBetween(x.sender_id, req.user.id))
        .map((x) => ({ id: x.id, body: x.body, created_at: x.created_at, mine: x.sender_id === req.user.id, sender: publicUser(getUser(x.sender_id), req.user) })),
    };
  }));
  api.post('/meetups/:id/messages', requireAuth, wrap((req, res) => {
    const m = inChat(req);
    mustBeVerified(req.user);
    if (m.status === 'hidden') throw notFound();
    const body = str(req.body?.body, 1000);
    if (!body) throw bad('Message is empty.');
    const id = Number(db.prepare('INSERT INTO meetup_messages (meetup_id, sender_id, body) VALUES (?,?,?)').run(m.id, req.user.id, body).lastInsertRowid);
    res.status(201);
    return { id, body, mine: true, created_at: db.prepare('SELECT created_at FROM meetup_messages WHERE id = ?').get(id).created_at };
  }));

  // ---------- check-in and ratings ----------
  // People check in at the meetup itself, with the code in the host's QR code. You don't need to have said you're
  // going (or for there to be space left): you're there.
  api.post('/meetups/:id/checkin', member, wrap((req) => {
    const me = req.user, m = getMeetup(req.params.id);
    if (!m || m.source === 'external' || m.status === 'hidden' || !!m.demo !== !!me.demo) throw notFound();
    if (m.host_id && blockedBetween(m.host_id, me.id)) throw notFound();
    const code = String(req.body?.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!m.checkin_code || code !== m.checkin_code) throw bad('That check-in code is not right. Scan the QR code the host shows at the meetup.', 'bad_code');
    mustBeReady(me);
    if (m.status === 'cancelled') throw bad('This meetup was cancelled.');
    if (m.host_id === me.id) throw bad("Hosts don't check in to their own meetup.");
    if (m.audience !== 'both' && m.audience !== me.role) throw bad(m.audience === 'aupair' ? 'This meetup is for au pairs.' : 'This meetup is for host families.');
    if (m.agency_only && agencySpace(me)?.id !== m.agency_id) throw notFound();
    const w = checkinWindow(m), t = Date.now();
    if (t < w.opens) throw bad('Check-in opens 30 minutes before the meetup starts.', 'too_early');
    if (t > w.closes) throw bad('Check-in for this meetup has closed.', 'closed');
    if (!db.prepare('SELECT 1 FROM meetup_checkins WHERE meetup_id = ? AND user_id = ?').get(m.id, me.id)) {
      // New to the city's community: their first check-in at any meetup there.
      const seen = db.prepare(`SELECT 1 FROM meetup_checkins c JOIN meetups x ON x.id = c.meetup_id WHERE c.user_id = ? AND x.country = ? AND x.city_key = ?`).get(me.id, m.country, m.city_key);
      tx(db, () => {
        db.prepare('INSERT OR IGNORE INTO meetup_attendees (meetup_id, user_id) VALUES (?,?)').run(m.id, me.id);
        db.prepare('INSERT INTO meetup_checkins (meetup_id, user_id, newcomer) VALUES (?,?,?)').run(m.id, me.id, seen ? 0 : 1);
      });
    }
    return { meetup: meetupView(getMeetup(m.id), me, true) };
  }));
  api.post('/meetups/:id/rating', member, wrap((req) => {
    const me = req.user, m = getMeetup(req.params.id);
    if (!m || !db.prepare('SELECT 1 FROM meetup_checkins WHERE meetup_id = ? AND user_id = ?').get(m.id, me.id)) throw new HttpError(403, 'Only people who checked in at the meetup can rate it.');
    const stars = Number(req.body?.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw bad('Pick 1 to 5 stars.');
    if (Date.now() < Date.parse(m.starts_at)) throw bad('You can rate the meetup once it has started.');
    if (Date.now() > ratingCloses(m, ratingDays())) throw bad('Ratings for this meetup have closed.');
    db.prepare(`INSERT INTO meetup_ratings (meetup_id, user_id, stars, comment) VALUES (?,?,?,?)
      ON CONFLICT(meetup_id, user_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, created_at = datetime('now')`).run(m.id, me.id, stars, str(req.body?.comment, 500) || null);
    return { meetup: meetupView(m, me, true) };
  }));
  // The QR code the host shows: it opens the check-in page with the code filled in.
  api.get('/meetups/:id/qr.svg', requireAuth, wrap(async (req, res) => {
    const m = getMeetup(req.params.id);
    if (!m || m.source === 'external' || !runsIt(m, req.user)) throw notFound();
    const svg = await QRCode.toString(`${publicBase()}/#/checkin/${m.id}/${codeOf(m)}`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1d1b3a', light: '#ffffff' } });
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' }).send(svg);
  }));
  // The same as a PNG, for the phone app.
  api.get('/meetups/:id/qr.png', requireAuth, wrap(async (req, res) => {
    const m = getMeetup(req.params.id);
    if (!m || m.source === 'external' || !runsIt(m, req.user)) throw notFound();
    const png = await QRCode.toBuffer(`${publicBase()}/#/checkin/${m.id}/${codeOf(m)}`, { type: 'png', width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1d1b3a', light: '#ffffff' } });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' }).send(png);
  }));
  /** Asks everyone who checked in at a meetup that ended to rate it, once. Run hourly. */
  const askForRatings = () => {
    const since = new Date(Date.now() - 2 * 86400e3).toISOString();
    for (const m of db.prepare("SELECT * FROM meetups WHERE rating_asked_at IS NULL AND status = 'open' AND source != 'external' AND starts_at >= ?").all(since)) {
      if (Date.now() < checkinWindow(m).closes - CHECKIN_AFTER_MS) continue; // not over yet
      db.prepare("UPDATE meetups SET rating_asked_at = datetime('now') WHERE id = ?").run(m.id);
      for (const c of db.prepare('SELECT user_id FROM meetup_checkins WHERE meetup_id = ?').all(m.id)) {
        notify(c.user_id, 'nearby', 'How was {title}? Rate it in a tap.', { title: m.title }, `#/meetups/${m.id}`);
      }
    }
  };

  // Reporting a meetup goes to the admin's reports. Enough reports from different people hide it until the admin looks.
  api.post('/meetups/:id/report', requireAuth, wrap((req, res) => {
    const m = seeMeetup(req);
    const reason = str(req.body?.reason, 2000);
    if (!reason) throw bad('Tell us what happened.');
    db.prepare('INSERT INTO reports (reporter_id, target_user_id, meetup_id, reason) VALUES (?,?,?,?)').run(req.user.id, m.host_id ?? null, m.id, reason);
    const reporters = db.prepare("SELECT COUNT(DISTINCT reporter_id) n FROM reports WHERE meetup_id = ? AND status = 'open'").get(m.id).n;
    if (reporters >= REPORTS_TO_HIDE && m.status === 'open') db.prepare("UPDATE meetups SET status = 'hidden' WHERE id = ?").run(m.id);
    res.status(201);
    return { ok: true };
  }));

  // ---------- the map ----------
  // Never a pin per person: meetups as pins (rounded unless you're going), and people as counts per area of about
  // 5 km, shown only where at least MAP_MIN_BUBBLE people are, so no bubble points at one person.
  // Everyone counts, not only people who set up Nearby: someone who shared a point counts there, and everyone else
  // counts at the general spot of the city or neighbourhood on their profile (geo.js), so nobody has to turn on
  // location. Only people who turned Nearby on and chose to hide are left out.
  const MAP_CELL = 0.05;
  const MAP_MIN_BUBBLE = 3;
  /** Members of role active lately and in good standing, with their Nearby row if they have one. */
  const mapPeople = (country, role, demo) => db.prepare(`SELECT u.*, n.city AS n_city, n.city_key AS n_city_key, n.lat AS n_lat, n.lng AS n_lng, n.visible AS n_visible
      FROM users u LEFT JOIN nearby_settings n ON n.user_id = u.id
      WHERE u.role = ? AND u.suspended = 0 AND u.email_verified = 1 AND u.demo = ? AND u.last_active_at >= datetime('now', ?)
        AND COALESCE(n.country, u.country) = ?`).all(role, demo ? 1 : 0, `-${ACTIVE_DAYS} days`, country);
  api.get('/nearby/map', member, wrap(async (req) => {
    const me = req.user;
    const settings = areaOf(me.id);
    // Before someone sets up Nearby, the map uses the city on their profile.
    const area = settings ?? (me.city && me.country ? { city: me.city, city_key: cityKey(me.city), country: String(me.country).toUpperCase(), lat: null, lng: null, visible: 0 } : null);
    if (!area) return { settings: null, needs_city: true };
    const other = me.role === 'family' ? 'aupair' : 'family';
    const rowsOf = (role) => mapPeople(area.country, role, me.demo).filter((u) => u.n_visible !== 0);
    const byRole = { [me.role]: rowsOf(me.role), [other]: rowsOf(other) };
    const placeOf = (u) => (u.n_lat != null ? null : [u.n_city || u.city, area.country]);
    await geo.warm([[area.city, area.country], ...[...byRole[me.role], ...byRole[other]].map(placeOf).filter(Boolean)]);
    const centre = hasPoint(area) ? { lat: area.lat, lng: area.lng } : geo.point(area.city, area.country);
    const here = { ...area, ...(centre || {}) };
    /** Anonymous counts per area of about 5 km for one side, each 3 or more. */
    const bubbles = (rows) => {
      const cells = new Map();
      for (const u of rows) {
        if (u.id !== me.id && !canMeet(me, u)) continue;
        const spot = u.n_lat != null ? { lat: u.n_lat, lng: u.n_lng } : geo.point(u.n_city || u.city, area.country);
        if (!spot) continue;
        if (!isNear(here, { country: area.country, city_key: u.n_city_key || cityKey(u.city), ...spot }, NEAR_KM)) continue;
        const key = `${Math.round(spot.lat / MAP_CELL)}:${Math.round(spot.lng / MAP_CELL)}`;
        const c = cells.get(key) || { n: 0, lat: 0, lng: 0 };
        c.n++; c.lat += spot.lat; c.lng += spot.lng;
        cells.set(key, c);
      }
      // An area with too few people for its own bubble joins the nearest bubble within 15 km, or else they all add up
      // at the city's general spot, so people in small neighbourhoods still count without standing out.
      const mid = (c) => ({ lat: c.lat / c.n, lng: c.lng / c.n });
      const big = [...cells.values()].filter((c) => c.n >= MAP_MIN_BUBBLE).map((c) => ({ ...mid(c), count: c.n }));
      const rest = { n: 0 };
      for (const c of cells.values()) {
        if (c.n >= MAP_MIN_BUBBLE) continue;
        const near = big.map((x) => ({ x, km: distanceKm(x, mid(c)) })).filter((y) => y.km <= 15).sort((p, q) => p.km - q.km)[0];
        if (near) near.x.count += c.n; else rest.n += c.n;
      }
      if (rest.n >= MAP_MIN_BUBBLE && centre) big.push({ ...centre, count: rest.n });
      return big.map((x) => ({ lat: Number(x.lat.toFixed(2)), lng: Number(x.lng.toFixed(2)), count: x.count }));
    };
    // areas: your own side, as the apps have always read it. other_areas: the other side (au pairs for a family,
    // families for an au pair), with role, for apps that show both.
    const areas = bubbles(byRole[me.role]);
    const otherAreas = bubbles(byRole[other]).map((x) => ({ ...x, role: other }));
    const meetups = meetupsIn(area, me).filter((m) => m.point);
    const listed = settings ? cityPeople(settings, me.role, me.demo).length : 0;
    return {
      settings: settingsView(settings),
      // Where to centre the map: your own rounded point, else your city's general spot, else the middle of what's on it.
      center: centre,
      city: { name: area.city, country: area.country, unlocked: listed >= minPeople(), people: listed, needed: Math.max(0, minPeople() - listed) },
      areas, other_areas: otherAreas, meetups,
    };
  }));

  // ---------- agencies ----------
  api.get('/agency/meetups', requireRole('agency'), wrap((req) => {
    const a = myAgency(req.user);
    if (!a) return { meetups: [] };
    return { meetups: db.prepare('SELECT * FROM meetups WHERE agency_id = ? ORDER BY starts_at DESC LIMIT 100').all(a.id).map((m) => meetupView(m, req.user, true)) };
  }));

  // ---------- admin ----------
  api.get('/admin/meetups', requireRole('admin'), wrap((req) => {
    const since = new Date(Date.now() - 7 * 86400e3).toISOString();
    return {
      meetups: db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM reports r WHERE r.meetup_id = m.id AND r.status = 'open') open_reports
          FROM meetups m WHERE m.starts_at >= ? OR m.status = 'hidden' ORDER BY m.status = 'hidden' DESC, open_reports DESC, m.starts_at LIMIT 300`).all(since)
        .map((m) => ({ ...meetupView(m, req.user, true), place: m.place, open_reports: m.open_reports })),
      cities: db.prepare(`SELECT n.country, n.city, u.role, COUNT(*) people FROM nearby_settings n JOIN users u ON u.id = n.user_id
          WHERE u.demo = 0 AND u.test_account = 0 AND u.suspended = 0 GROUP BY n.country, n.city_key, u.role ORDER BY people DESC LIMIT 50`).all(),
      min_people: minPeople(), kinds: MEETUP_KINDS,
    };
  }));
  api.post('/admin/meetups/:id', requireRole('admin'), wrap((req) => {
    const m = getMeetup(req.params.id);
    if (!m) throw notFound();
    const status = req.body?.status;
    if (!['open', 'hidden', 'cancelled'].includes(status)) throw bad('Unknown status.');
    tx(db, () => {
      db.prepare('UPDATE meetups SET status = ? WHERE id = ?').run(status, m.id);
      if (status === 'open') db.prepare("UPDATE reports SET status = 'dismissed' WHERE meetup_id = ? AND status = 'open'").run(m.id);
      if (status !== 'open') db.prepare("UPDATE reports SET status = 'resolved' WHERE meetup_id = ? AND status = 'open'").run(m.id);
    });
    return { ok: true };
  }));

  /** For Discover's "Find an au pair near you": whether an au pair is near this family, and how far as a band.
   *  The family's area is their Nearby city, else their profile's city. Returns null when the family has no city. */
  const nearFamily = (fam) => {
    const own = areaOf(fam.id);
    const area = own || (fam.city && fam.country ? { country: fam.country, city_key: cityKey(fam.city), lat: null, lng: null } : null);
    if (!area) return null;
    const findable = new Map(db.prepare('SELECT * FROM nearby_settings WHERE families_can_find = 1 AND country = ?').all(area.country).map((n) => [n.user_id, n]));
    return (userId) => {
      const n = findable.get(userId);
      return n && isNear(area, n) ? { distance: distanceBand(area, n), city: n.city } : null;
    };
  };
  return { nearFamily, askForRatings };
}
