// Turns a city or neighbourhood name ("Södermalm", "Solna") into the area's general spot, so the Nearby map can count
// people by area without anyone sharing their device location. Looked up once per name with OpenStreetMap's
// Nominatim (one request a second, a real User-Agent and a permanent cache, as its usage policy asks) and snapped to
// a ~2 km grid. Misses are cached too, and retried after a week.
const GRID = 0.02;
const RETRY_MISS_DAYS = 7;
const snap = (v) => Number((Math.round(Number(v) / GRID) * GRID).toFixed(2));
const keyOf = (place, country) => `${String(country || '').toUpperCase()}|${String(place || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;

/** The default lookup: Nominatim's free-text search, limited to the country. */
const nominatim = (fetchImpl) => async (place, country) => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=${encodeURIComponent(country.toLowerCase())}&q=${encodeURIComponent(place)}`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'PairMundo/1.0 (+https://pairmundo.com)', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
};

export function createGeo(db, { lookup = nominatim((...a) => fetch(...a)), gapMs = 1100 } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS geo_cache (key TEXT PRIMARY KEY, lat REAL, lng REAL, looked_up_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const cached = (key) => db.prepare('SELECT * FROM geo_cache WHERE key = ?').get(key);
  const fresh = (row) => row && (row.lat != null || Date.parse(row.looked_up_at + 'Z') > Date.now() - RETRY_MISS_DAYS * 86400e3);
  let chain = Promise.resolve();
  let last = 0;
  const pending = new Map();
  /** Looks one name up (queued, one at a time, gapMs apart), stores the result and resolves to it. */
  const fetchOne = (key, place, country) => {
    if (pending.has(key)) return pending.get(key);
    const p = chain = chain.then(async () => {
      if (fresh(cached(key))) return;
      const wait = last + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      let hit = null;
      try { hit = await lookup(place, country); } catch { return; } // a network error is not a miss: try again next time
      db.prepare(`INSERT INTO geo_cache (key, lat, lng, looked_up_at) VALUES (?,?,?, datetime('now')) ON CONFLICT(key) DO UPDATE
        SET lat = excluded.lat, lng = excluded.lng, looked_up_at = excluded.looked_up_at`).run(key, hit ? snap(hit.lat) : null, hit ? snap(hit.lng) : null);
    }).finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  };
  return {
    /** The cached spot for a place, or null. Unknown places are looked up in the background. */
    point(place, country) {
      if (!place || !/^[A-Za-z]{2}$/.test(String(country || ''))) return null;
      const key = keyOf(place, country);
      const row = cached(key);
      if (!fresh(row)) fetchOne(key, String(place).trim(), String(country).toUpperCase());
      return row?.lat != null ? { lat: row.lat, lng: row.lng } : null;
    },
    /** Looks up the places not cached yet, waiting at most maxWaitMs, so a first map load already has them. */
    async warm(places, maxWaitMs = 2500) {
      const todo = [];
      for (const [place, country] of places) {
        if (!place || !/^[A-Za-z]{2}$/.test(String(country || ''))) continue;
        const key = keyOf(place, country);
        if (!fresh(cached(key))) todo.push(fetchOne(key, String(place).trim(), String(country).toUpperCase()));
      }
      if (todo.length) await Promise.race([Promise.all(todo), new Promise((r) => setTimeout(r, maxWaitMs))]);
    },
  };
}
