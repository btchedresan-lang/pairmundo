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

const GRID = 0.02; // degrees, about 2.2 km north-south
const ACTIVE_DAYS = 30;
const MAX_HOSTED = 3; // upcoming meetups a member can host at once
const HELLOS_PER_DAY = 20;
const REPORTS_TO_HIDE = 3;
export const MEETUP_KINDS = ['coffee', 'walk', 'picnic', 'playdate', 'sport', 'language', 'culture', 'other'];
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
    conversationFor, mustBeReady, mustBeVerified, agencySpace, shortName, photosOf } = deps;
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
  /** People of role in the same city who are on Nearby and visible, active lately and in good standing. */
  const cityPeople = (area, role, demo) => db.prepare(`SELECT u.*, n.lat, n.lng FROM nearby_settings n JOIN users u ON u.id = n.user_id
      WHERE n.country = ? AND n.city_key = ? AND n.visible = 1 AND u.role = ? AND u.suspended = 0 AND u.email_verified = 1 AND u.demo = ?
        AND u.last_active_at >= datetime('now', ?)`).all(area.country, area.city_key, role, demo ? 1 : 0, `-${ACTIVE_DAYS} days`);
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
    const v = {
      id: m.id, source: m.source, official: m.source === 'agency', external: m.source === 'external', kind: m.kind, title: m.title, about: m.about,
      city: m.city, country: m.country, area: m.area, starts_at: m.starts_at, ends_at: m.ends_at, started: m.starts_at < now(), audience: m.audience, agency_only: !!m.agency_only,
      max_people: m.max_people, going: goingCount(m), status: m.status, i_am_going: going, i_host: !!runs && u.role !== 'admin',
      host: host ? publicUser(host, u) : null, agency: agency?.name ?? null, organizer: m.organizer, external_url: m.external_url,
      // The exact spot is for people going; everyone else sees the neighbourhood.
      place: insider ? m.place : null,
    };
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
    if (!t || t.role !== me.role || t.suspended || !theirs?.visible || !isNear(area, theirs, 0) || !canMeet(me, t)) throw notFound();
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
    return { title, kind, place, about: str(b.about, 1000) || null, area: str(b.area, 80) || null, starts_at: start.toISOString(), ends_at: end, max_people: n };
  };
  const insertMeetup = (m) => {
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
    return { ok: true };
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
          WHERE u.demo = 0 GROUP BY n.country, n.city_key, u.role ORDER BY people DESC LIMIT 50`).all(),
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
  return { nearFamily };
}
