// PairMundo single-page client. Hash routing, no build step.

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
let me = null; // { user, profile, rating, counts }
let pollTimer = null;

// ---------- reference data ----------
const COUNTRIES = {
  AR: 'Argentina', AT: 'Austria', AU: 'Australia', BE: 'Belgium', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland', CN: 'China', CO: 'Colombia',
  CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', ES: 'Spain', FI: 'Finland', FR: 'France', GB: 'United Kingdom', GH: 'Ghana', GR: 'Greece',
  HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IN: 'India', IT: 'Italy', JP: 'Japan', KE: 'Kenya', KR: 'South Korea', MA: 'Morocco',
  MX: 'Mexico', NG: 'Nigeria', NL: 'Netherlands', NO: 'Norway', NZ: 'New Zealand', PE: 'Peru', PH: 'Philippines', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SN: 'Senegal', TH: 'Thailand', TR: 'Türkiye', UA: 'Ukraine', US: 'United States',
  VN: 'Vietnam', ZA: 'South Africa',
};
const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish',
  da: 'Danish', no: 'Norwegian', pl: 'Polish', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', th: 'Thai', ar: 'Arabic',
  ru: 'Russian', uk: 'Ukrainian', tr: 'Turkish', af: 'Afrikaans', sw: 'Swahili', hi: 'Hindi', tl: 'Tagalog', ro: 'Romanian', cs: 'Czech', el: 'Greek' };
const LEVELS = ['native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];
const STATUSES = { proposed: 'Proposed', confirmed: 'Confirmed', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
const statusLabel = (s) => (STATUSES[s] ? tr(STATUSES[s]) : s);
const AGE_GROUPS = { infant: 'Infants (0-2)', toddler: 'Toddlers (2-5)', school: 'School age (5-12)', teen: 'Teens (13+)' };
const SKILLS = { first_aid: 'First aid', swimming: 'Swimming', cooking: 'Cooking', tutoring: 'Homework help', music: 'Music', art: 'Arts & crafts',
  sports: 'Sports', special_needs: 'Special needs care', housekeeping: 'Light housekeeping' };
const TRAITS = { patient: 'Patient', caring: 'Caring', responsible: 'Responsible', fun: 'Fun', calm: 'Calm', creative: 'Creative',
  curious: 'Curious', organised: 'Organised', sporty: 'Sporty', cheerful: 'Cheerful', flexible: 'Flexible', reliable: 'Reliable' };
const HOBBIES = { travel: ['✈️', 'Travelling'], outdoors: ['⛰️', 'Hiking and nature'], skiing: ['⛷️', 'Skiing'], beach: ['🌊', 'The ocean'],
  animals: ['🐾', 'Animals'], movies: ['🎬', 'Movies and series'], sports: ['⚽', 'Sports'], music: ['🎵', 'Music'], reading: ['📚', 'Reading'],
  cooking: ['🍳', 'Cooking and baking'], art: ['🎨', 'Drawing and crafts'], dancing: ['💃', 'Dancing'], photography: ['📷', 'Photography'],
  friends: ['👯', 'Time with friends'], languages: ['🗣️', 'Learning languages'], gaming: ['🎮', 'Games'] };
const CRIT_LABEL = { reliability: 'Reliability', childcare: 'Childcare', communication: 'Communication', household: 'Household help',
  adaptability: 'Adaptability', respect: 'Respect', accommodation: 'Accommodation', fair_hours: 'Fair hours', support: 'Support & inclusion' };

// ---------- languages ----------
// Text is written in English and wrapped in tr(); /locales/<lang>.json maps it to a translation.
// Missing text shows in English. `npm run i18n` (in server/) lists what's missing.
const LANGUAGES = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', sv: 'Svenska' };
const browserLang = () => (navigator.languages || [navigator.language]).map((l) => String(l).slice(0, 2).toLowerCase()).find((c) => c in LANGUAGES) || 'en';
const savedLang = () => { try { return localStorage.getItem('lang'); } catch { return null; } };
let LANG = LANGUAGES[savedLang()] ? savedLang() : browserLang();
let DICT = {};
async function loadLang() {
  DICT = LANG === 'en' ? {} : await fetch(`/locales/${LANG}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  document.documentElement.lang = LANG;
}
/** Translate English text. `{name}` placeholders are filled from vars: tr('Block {name}?', { name }). */
function tr(text, vars) {
  const s = DICT[text] || text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
/** Pick the singular or plural text by count; the count is available as {n}. */
const trn = (n, one, other, vars) => tr(n === 1 ? one : other, { n, ...vars });
const trMap = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, tr(v)]));
async function setLanguage(code) {
  try { if (code) localStorage.setItem('lang', code); else localStorage.removeItem('lang'); } catch { /* private mode */ }
  LANG = code || browserLang();
  await loadLang();
  renderFooter(); route();
}
function renderFooter() {
  const $foot = document.getElementById('foot'); if (!$foot) return;
  $foot.innerHTML = `<a href="/privacy" target="_blank">${tr('Privacy Policy')}</a> · <a href="/terms" target="_blank">${tr('Terms of Use')}</a>
    <label style="margin-left:12px">🌐 <select id="langPick" aria-label="${tr('Language')}">${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
  document.getElementById('langPick').onchange = (e) => setLanguage(e.target.value);
}

// ---------- utils ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');
const country = (cc) => (COUNTRIES[cc] ? tr(COUNTRIES[cc]) : cc || '');
const langName = (code) => (LANGS[code] ? tr(LANGS[code]) : code);
const cname = (cc) => (cc ? `${flag(cc)} ${country(cc)}` : '');
const stars = (n) => (n == null ? `<span class="muted small">${tr('No reviews yet')}</span>`
  : `<span class="stars" aria-label="${tr('{n} out of 5', { n })}">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span> <strong>${n}</strong>`);
const fmtDate = (d) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T') + (d.includes('Z') || d.length === 10 ? '' : 'Z'))
  .toLocaleDateString(LANG, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const fmtTime = (d) => new Date(d.replace(' ', 'T') + 'Z').toLocaleString(LANG, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const initials = (name) => esc(String(name || '?').split(/\s+/).filter((w) => !/^(the|family|familie|famille|familia|familien)$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
const firstName = (name) => { const w = String(name || '').split(' '); return /^(the)$/i.test(w[0]) ? w[1] : w[0]; };
const avatar = (u, size = '') => (u?.photo_url
  ? `<img class="avatar ${size}" src="${esc(u.photos?.[0] || u.photo_url)}" alt="" onerror="this.outerHTML='<span class=&quot;avatar ${size}&quot;>${initials(u.name)}</span>'">`
  : `<span class="avatar ${size}">${initials(u?.name)}</span>`);
const verifyBadges = (v) => [v?.id && `✔ ${tr('ID verified')}`, v?.references && `✔ ${tr('References')}`, v?.background && `✔ ${tr('Background check')}`]
  .filter(Boolean).map((t) => `<span class="verify">${t}</span>`).join(' ');
const scoreBadge = (s) => `<span class="score ${s >= 75 ? 'high' : s < 50 ? 'low' : ''}" title="${tr('Match score')}">${s}%</span>`;
/** <option>s for a { value: 'English label' } map, translated and sorted by label. */
const options = (obj, selected, blank = '', sort = true) => (blank !== null ? `<option value="">${blank}</option>` : '')
  + Object.entries(trMap(obj)).sort(sort ? (a, b) => a[1].localeCompare(b[1], LANG) : () => 0).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method, credentials: 'same-origin',
    headers: { 'Accept-Language': LANG, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error ? tr(data.error) : tr('Request failed ({status})', { status: res.status })); e.status = res.status; e.data = data; throw e; }
  return data;
}

const formData = (form) => Object.fromEntries(new FormData(form).entries());
const render = (html) => { $app.innerHTML = html; window.scrollTo(0, 0); };
const go = (hash) => { location.hash = hash; };

// ---------- nav ----------
async function refreshMe() {
  try { me = await api('/me'); } catch { me = null; }
  renderNav();
}
function renderNav() {
  const route = location.hash.split('/')[1] || '';
  const link = (href, label, count, icon) => `<a href="${href}" class="${href.split('/')[1] === route || (route === '' && href === '#/discover') ? 'active' : ''}">${icon ? `<span class="nav-icon">${icon}</span>` : ''}<span class="nav-label">${label}</span>${count ? `<span class="badge">${count}</span>` : ''}</a>`;
  document.body.classList.toggle('has-tabs', !!me && me.user.role !== 'admin');
  if (!me) { $nav.innerHTML = link('#/programs', tr('Country programs')) + link('#/login', tr('Sign in')) + `<a class="btn sm" href="#/register">${tr('Join free')}</a>`; return; }
  const c = me.counts;
  if (me.user.role === 'admin') {
    $nav.innerHTML = [link('#/admin', 'Admin'), link('#/placements', 'Placements'), link('#/programs', 'Programs'), link('#/notifications', '🔔', c.notifications), `<a href="#/logout">${tr('Sign out')}</a>`].join('');
    return;
  }
  $nav.innerHTML = [
    link('#/discover', tr('Discover'), 0, '🔥'),
    link('#/likes', tr('Likes'), c.requests, '💛'),
    link('#/matches', tr('Matches'), c.messages, '💬'),
    link('#/placements', tr('Placements'), 0, '🧳'),
    link('#/profile', tr('Profile'), 0, '👤'),
    `<a href="#/notifications" class="nav-bell ${route === 'notifications' ? 'active' : ''}">🔔${c.notifications ? `<span class="badge">${c.notifications}</span>` : ''}</a>`,
    `<a href="#/logout" class="nav-signout">${tr('Sign out')}</a>`,
  ].join('');
}

// ---------- views ----------
const views = {};

views.home = async () => {
  if (!me) return landing();
  return go(me.user.role === 'admin' ? '#/admin' : '#/discover');
};

// ---------- photos ----------
const photoOrPlaceholder = (u, cls = '') => (u?.photos?.[0] || u?.photo_url
  ? `<img class="${cls}" src="${esc(u.photos?.[0] || u.photo_url)}" alt="${esc(u.name)}" draggable="false">`
  : `<div class="${cls} photo-placeholder"><span>${initials(u?.name)}</span></div>`);

/** Photo gallery with Tinder-style progress bars; tap left/right half to move. */
function gallery(u, { cls = '' } = {}) {
  const photos = u.photos?.length ? u.photos : [];
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  setTimeout(() => {
    const el = document.getElementById(id); if (!el) return;
    let i = 0;
    el.tap = (clientX) => {
      if (photos.length < 2) return;
      const r = el.getBoundingClientRect();
      i = (clientX - r.left) < r.width / 2 ? Math.max(0, i - 1) : Math.min(photos.length - 1, i + 1);
      el.querySelector('img.gal-img').src = photos[i];
      el.querySelectorAll('.photo-bars span').forEach((b, j) => b.classList.toggle('on', j === i));
    };
    // Inside a swipe card the card handles taps itself (it captures the pointer).
    if (!el.closest('.swipe-card')) el.addEventListener('click', (e) => el.tap(e.clientX));
  });
  return `<div class="gallery ${cls}" id="${id}">
    ${photos.length ? `<img class="gal-img" src="${esc(photos[0])}" alt="${esc(u.name)}" draggable="false">` : `<div class="gal-img photo-placeholder"><span>${initials(u.name)}</span></div>`}
    ${photos.length > 1 ? `<div class="photo-bars">${photos.map((_, j) => `<span class="${j === 0 ? 'on' : ''}"></span>`).join('')}</div>` : ''}</div>`;
}

const ageOf = (r) => (r.user.role === 'aupair' ? r.profile?.age : null);
function cardCaption(r) {
  const u = r.user; const p = r.profile || {};
  const kids = p.children?.length ? `${trn(p.children.length, '{n} child', '{n} children')} (${p.children.map((c) => c.age).join(', ')})` : '';
  const langs = u.role === 'aupair' ? (p.languages || []).map((l) => langName(l.code)) : (p.languages || []).map((l) => langName(l));
  return `<div class="card-info">
    <h2>${esc(u.name)}${ageOf(r) ? ` <span class="age">${ageOf(r)}</span>` : ''} ${u.verification?.id ? `<span class="tick" title="${tr('ID verified')}">✔</span>` : ''}</h2>
    <div class="sub">${flag(u.country)} ${esc([u.city, country(u.country)].filter(Boolean).join(', '))}${u.role === 'aupair' && p.nationality && p.nationality !== u.country ? ` · ${flag(p.nationality)} ${esc(country(p.nationality))}` : ''}</div>
    <div class="sub">${u.role === 'aupair' ? [p.childcare_years ? trn(p.childcare_years, '{n} year of childcare', '{n} years of childcare') : '', p.available_from ? tr('From {date}', { date: fmtDate(p.available_from) }) : ''].filter(Boolean).join(' · ') : [kids, p.start_date ? tr('Starts {date}', { date: fmtDate(p.start_date) }) : ''].filter(Boolean).join(' · ')}</div>
    <div class="chips">${langs.slice(0, 3).map((l) => `<span class="chip glass">${esc(l)}</span>`).join('')}${r.rating?.avg ? `<span class="chip glass">★ ${r.rating.avg}</span>` : ''}${u.role === 'aupair' && p.drivers_license ? '<span class="chip glass">🚗</span>' : ''}</div>
    ${r.match?.reasons?.length ? `<div class="reason">✓ ${esc(r.match.reasons[0])}</div>` : ''}
  </div>`;
}

// ---------- discover (swipe deck) ----------
let deck = [];
let deckQuery = '';
views.discover = async (_, query) => {
  const isFamily = me.user.role === 'family';
  const q = Object.fromEntries(query.entries());
  deckQuery = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  const nFilters = Object.values(q).filter(Boolean).length;
  const completeness = profileCompleteness();
  render(`<div class="discover">
    ${!me.user.email_verified ? `<a class="alert warning nudge" href="#/verify">📧 ${tr('Confirm your email to start liking. Click to enter your code.')}</a>` : ''}
    ${!(me.user.photos?.length) ? `<a class="alert warning nudge" href="#/profile">📸 ${isFamily ? tr('Add a photo so au pairs can see you. Profiles with photos get far more matches.') : tr('Add a photo so families can see you. Profiles with photos get far more matches.')}</a>`
    : completeness < 70 ? `<a class="alert info nudge" href="#/profile">${tr('Your profile is {n}% complete. Finish it to improve your matches →', { n: completeness })}</a>` : ''}
    <div class="disc-head"><button class="btn ghost sm" id="toggleFilters">⚙ ${tr('Filters')}${nFilters ? ` (${nFilters})` : ''}</button>
      <a class="btn ghost sm" href="#/search${deckQuery ? `?${deckQuery}` : ''}">☰ ${tr('List view')}</a></div>
    <form class="card filters" id="filters" hidden>
      <div class="form-grid">
      <div class="field"><label>${isFamily ? tr('Lives in') : tr('Family country')}</label><select name="country">${options(COUNTRIES, q.country, tr('Anywhere'))}</select></div>
      ${isFamily ? `<div class="field"><label>${tr('Nationality')}</label><select name="nationality">${options(COUNTRIES, q.nationality, tr('Any'))}</select></div>` : ''}
      <div class="field"><label>${tr('Language')}</label><select name="language">${options(LANGS, q.language, tr('Any'))}</select></div>
      ${isFamily ? `<div class="field"><label>${tr('Age')}</label><div class="row" style="flex-wrap:nowrap"><input type="number" name="min_age" min="17" max="35" placeholder="${tr('min')}" value="${esc(q.min_age)}"><input type="number" name="max_age" min="17" max="35" placeholder="${tr('max')}" value="${esc(q.max_age)}"></div></div>
      <div class="field"><label>${tr('Available by')}</label><input type="date" name="available_by" value="${esc(q.available_by)}"></div>` : ''}
      </div>
      <div class="row">${isFamily ? `<label class="check"><input type="checkbox" name="driver" value="1" ${q.driver ? 'checked' : ''}> ${tr('Driver')}</label>` : ''}
        <label class="check"><input type="checkbox" name="verified" value="1" ${q.verified ? 'checked' : ''}> ${tr('ID verified only')}</label>
        <span style="flex:1"></span><a class="btn ghost sm" href="#/discover">${tr('Clear')}</a><button class="btn sm">${tr('Apply')}</button></div>
    </form>
    <div class="deck" id="deck"><div class="deck-empty">${tr('Finding people for you…')}</div></div>
    <div class="deck-actions" id="deckActions">
      <button class="round sm undo" id="undo" title="${tr('Undo last swipe')}">↺</button>
      <button class="round lg nope" id="nope" title="${tr('Pass')} (←)">✕</button>
      <button class="round sm super" id="super" title="${tr('Super like')} (↑)">★</button>
      <button class="round lg like" id="like" title="${tr('Like')} (→)">♥</button>
      <button class="round sm info" id="info" title="${tr('Full profile')}">ⓘ</button>
    </div>
    <p class="muted small center hint">${tr('Drag the card, or use ← → ↑ on your keyboard.')}</p></div>`);
  document.getElementById('toggleFilters').onclick = () => { const f = document.getElementById('filters'); f.hidden = !f.hidden; };
  document.getElementById('filters').onsubmit = (e) => {
    e.preventDefault();
    go(`#/discover?${new URLSearchParams(Object.entries(formData(e.target)).filter(([, v]) => v))}`);
  };
  document.getElementById('nope').onclick = () => swipeTop('pass');
  document.getElementById('like').onclick = () => swipeTop('like');
  document.getElementById('super').onclick = () => swipeTop('super');
  document.getElementById('info').onclick = () => deck[0] && go(`#/u/${deck[0].user.id}`);
  document.getElementById('undo').onclick = undoSwipe;
  await loadDeck();
};

async function loadDeck(frontId) {
  const { results } = await api(`/discover${deckQuery ? `?${deckQuery}` : ''}`);
  deck = results;
  if (frontId) { const i = deck.findIndex((r) => r.user.id === frontId); if (i > 0) deck.unshift(...deck.splice(i, 1)); }
  renderDeck();
}

function renderDeck() {
  const $deck = document.getElementById('deck'); if (!$deck) return;
  document.getElementById('deckActions').classList.toggle('disabled', !deck.length);
  if (!deck.length) {
    $deck.innerHTML = `<div class="deck-empty"><div style="font-size:3rem">🌍</div><h2>${tr("You've seen everyone for now")}</h2>
      <p class="muted">${me.user.role === 'family' ? tr('New au pairs join every day. Try wider filters, or take another look at people you passed.') : tr('New families join every day. Try wider filters, or take another look at people you passed.')}</p>
      <div class="row" style="justify-content:center"><button class="btn secondary" id="resetPasses">${tr('Show passed profiles again')}</button><a class="btn ghost" href="#/discover">${tr('Clear filters')}</a></div></div>`;
    document.getElementById('resetPasses').onclick = async () => { await api('/swipes/passes', { method: 'DELETE' }); loadDeck(); };
    return;
  }
  $deck.innerHTML = deck.slice(0, 3).map((r, i) => `<div class="swipe-card" data-i="${i}" style="z-index:${10 - i};transform:scale(${1 - i * 0.04}) translateY(${i * 14}px)">
      ${gallery(r.user, { cls: 'card-gallery' })}
      <div class="stamp like">${tr('LIKE')}</div><div class="stamp nope">${tr('NOPE')}</div><div class="stamp super">${tr('SUPER')}</div>
      ${r.match ? `<div class="card-score ${r.match.score >= 75 ? 'high' : ''}">${tr('{n}% match', { n: r.match.score })}</div>` : ''}
      ${r.likes_you ? `<div class="likes-you">💛 ${tr('Likes you')}</div>` : ''}
      <div class="card-shade"></div>${cardCaption(r)}</div>`).join('');
  const top = $deck.querySelector('.swipe-card[data-i="0"]');
  const gal = top.querySelector('.gallery');
  let sx = 0; let sy = 0; let dx = 0; let dy = 0; let dragging = false;
  top.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; top.setPointerCapture(e.pointerId); top.style.transition = 'none'; });
  top.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    top.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    top.querySelector('.stamp.like').style.opacity = Math.max(0, Math.min(1, dx / 100));
    top.querySelector('.stamp.nope').style.opacity = Math.max(0, Math.min(1, -dx / 100));
    top.querySelector('.stamp.super').style.opacity = Math.abs(dx) < 60 ? Math.max(0, Math.min(1, -dy / 100)) : 0;
  });
  const end = (e) => {
    if (!dragging) return; dragging = false;
    top.style.transition = '';
    if (Math.abs(dx) + Math.abs(dy) < 6 && e.type === 'pointerup') {
      // A tap: the caption opens the profile, the photo flips through pictures.
      const info = top.querySelector('.card-info').getBoundingClientRect();
      if (e.clientY >= info.top) return go(`#/u/${deck[0].user.id}`);
      gal.tap?.(e.clientX);
      top.style.transform = '';
      return;
    }
    if (dx > 110) return swipeTop('like');
    if (dx < -110) return swipeTop('pass');
    if (dy < -120 && Math.abs(dx) < 80) return swipeTop('super');
    top.style.transform = '';
    top.querySelectorAll('.stamp').forEach((st) => { st.style.opacity = 0; });
  };
  top.addEventListener('pointerup', end);
  top.addEventListener('pointercancel', end);
}

let swiping = false;
async function swipeTop(direction) {
  const r = deck[0]; if (!r || swiping) return;
  swiping = true;
  const top = document.querySelector('.swipe-card[data-i="0"]');
  if (top) {
    top.style.transition = 'transform .35s ease-out, opacity .35s';
    top.querySelector(`.stamp.${direction === 'pass' ? 'nope' : direction}`).style.opacity = 1;
    top.style.transform = direction === 'like' ? 'translate(140%, 40px) rotate(24deg)' : direction === 'pass' ? 'translate(-140%, 40px) rotate(-24deg)' : 'translate(0, -140%)';
    top.style.opacity = '0';
  }
  try {
    const [res] = await Promise.all([api('/swipe', { method: 'POST', body: { target_id: r.user.id, direction } }), new Promise((ok) => setTimeout(ok, 300))]);
    deck.shift();
    renderDeck();
    if (res.matched) { showMatch(res.other || r.user, res.conversation_id); refreshMe(); }
    if (deck.length < 2) { const keep = deck.map((x) => x.user.id); const { results } = await api(`/discover${deckQuery ? `?${deckQuery}` : ''}`); deck = [...deck, ...results.filter((x) => !keep.includes(x.user.id))]; renderDeck(); }
  } catch (e) { if (!needsCode(e)) toast(e.message); renderDeck(); }
  finally { swiping = false; }
}

async function undoSwipe() {
  try { const { user } = await api('/swipe/undo', { method: 'POST' }); await loadDeck(user.id); toast(tr('Brought back {name}', { name: user.name })); }
  catch (e) { toast(e.message); }
}

function showMatch(other, convId) {
  const el = document.createElement('div');
  el.className = 'match-overlay';
  el.innerHTML = `<div class="match-box"><div class="match-title">${tr("It's a match!")}</div>
    <p>${tr('You and {name} liked each other.', { name: esc(other.name) })}</p>
    <div class="match-photos">${photoOrPlaceholder(me.user, 'match-photo')}${photoOrPlaceholder(other, 'match-photo')}</div>
    <a class="btn" href="#/messages/${convId}">💬 ${tr('Send a message')}</a>
    <button class="btn ghost" id="keep">${tr('Keep swiping')}</button></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#keep').onclick = close;
  el.querySelector('a').onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };
}

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('deck') || e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight') swipeTop('like');
  else if (e.key === 'ArrowLeft') swipeTop('pass');
  else if (e.key === 'ArrowUp') { e.preventDefault(); swipeTop('super'); }
});

// ---------- likes ----------
const tile = (r, extra = '') => `<a class="tile" href="#/u/${r.user.id}">${photoOrPlaceholder(r.user, 'tile-img')}<div class="card-shade"></div>
  ${r.super ? `<span class="tile-super">★ ${tr('Super like')}</span>` : ''}${r.match ? `<span class="tile-score">${r.match.score}%</span>` : ''}
  <div class="tile-info"><strong>${esc(r.user.name)}${ageOf(r) ? `, ${ageOf(r)}` : ''}</strong><span>${flag(r.user.country)} ${esc(country(r.user.country))}</span>${extra}</div></a>`;

views.likes = async () => {
  const { likes, locked, count } = await api('/likes');
  if (locked) {
    return render(`<h1>${trn(count, '{n} person likes you', '{n} people like you')}</h1>
      <div class="card" style="text-align:center"><p style="font-size:40px;margin:0">💛</p>
      <p>${tr('Get the Family Pass to see who liked you and to message au pairs.')}</p><a class="btn" href="#/family-pass">${tr('See the Family Pass')}</a></div>`);
  }
  render(`<h1>${trn(likes.length, '{n} person likes you', '{n} people like you')}</h1>
    <p class="muted">${tr('Like them back to match and start chatting.')}</p>
    <div class="tiles">${likes.map((l) => tile(l, l.message ? `<em>“${esc(l.message.slice(0, 60))}${l.message.length > 60 ? '…' : ''}”</em>` : '')).join('')
    || `<div class="empty" style="grid-column:1/-1">${tr('No new likes yet. Keep your profile fresh and keep swiping!')}<br><br><a class="btn" href="#/discover">${tr('Discover')}</a></div>`}</div>`);
};

// ---------- matches ----------
views.matches = async () => {
  const { conversations } = await api('/conversations');
  const fresh = conversations.filter((c) => !c.last_body);
  render(`<h1>${tr('Matches')}</h1>
    <div class="match-row">${conversations.map((c) => `<a href="#/messages/${c.id}" class="match-bubble">${photoOrPlaceholder(c.other, 'bubble-img')}
      ${c.unread ? '<span class="dot"></span>' : ''}<span>${esc(c.other.name.split(' ')[0] === 'The' ? c.other.name.split(' ')[1] : c.other.name.split(' ')[0])}</span></a>`).join('')
      || `<div class="muted">${tr('No matches yet.')} <a href="#/discover">${tr('Start swiping')}</a></div>`}</div>
    <h2 style="margin-top:20px">${tr('Messages')}</h2>
    <div class="card" style="padding:0">${conversations.filter((c) => c.last_body).map((c) => `<a href="#/messages/${c.id}" class="convo">
      ${photoOrPlaceholder(c.other, 'avatar')}<div style="flex:1;min-width:0"><div class="spread"><strong>${esc(c.other.name)}</strong><span class="muted small">${c.last_at ? fmtTime(c.last_at) : ''}</span></div>
      <div class="${c.unread ? '' : 'muted'} small ellipsis">${c.unread ? '<strong>' : ''}${esc(c.last_body)}${c.unread ? '</strong>' : ''}</div></div>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</a>`).join('')
      || `<div class="empty">${fresh.length ? tr('Say hi to your new matches above!') : tr('Your conversations will show up here.')}</div>`}</div>`);
};


function profileCompleteness() {
  const p = me.profile || {}; const u = me.user;
  const checks = u.role === 'aupair'
    ? [u.country, u.photos?.length, p.birth_date, p.nationality, p.languages?.length, p.preferred_countries?.length, p.age_groups?.length, p.available_from, p.duration_months, p.bio]
      : [u.country, u.city, u.photos?.length, p.children?.length, p.languages?.length, p.start_date, p.duration_months, p.weekly_hours, p.pocket_money, p.bio];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// Flyers and ads link to pairmundo.com/?src=<name>. Remember it for this visit so the waitlist knows which one worked.
function adSource() {
  try {
    const src = new URLSearchParams(location.search).get('src');
    if (src) sessionStorage.setItem('src', src);
    return src || sessionStorage.getItem('src') || undefined;
  } catch { return undefined; }
}

function landing() {
  const waitForm = (id) => `<form class="waitlist" id="${id}">
      <input name="email" type="email" required autocomplete="email" placeholder="${tr('Your email')}" aria-label="${tr('Your email')}">
      <select name="role" aria-label="${tr('I am')}"><option value="family">${tr('A host family')}</option><option value="aupair">${tr('An au pair')}</option></select>
      <button class="btn">${tr('Notify me')}</button></form>`;
  render(`
    <section class="hero">
      <span class="chip">📱 ${tr('iPhone and Android apps coming soon')}</span>
      <h1>${tr('Swipe. Match. Welcome your au pair.')}</h1>
      <p>${tr("Photo-first profiles from families and au pairs worldwide. Swipe right on the ones you like; when it's mutual, you're matched and can chat. Program rules, verification and two-way reviews are built in.")}</p>
      <div class="row" style="justify-content:center"><a class="btn" href="#/register?role=family">${tr("I'm a host family")}</a>
      <a class="btn secondary" href="#/register?role=aupair">${tr('I want to be an au pair')}</a></div>
      <p class="small muted" style="margin-top:12px">${tr('Free for au pairs. Swiping and matching are free for everyone.')}</p>
    </section>
    <section class="card wait-card"><h2>${tr('Be the first to get the app')}</h2>
      <p class="muted">${tr("Leave your email and we'll tell you the day PairMundo arrives on the App Store and Google Play. No spam, and you can leave the list anytime.")}</p>
      ${waitForm('wait1')}<div id="waitMsg1"></div></section>
    <h2 class="center" style="margin:36px 0 16px">${tr('How it works')}</h2>
    <div class="grid steps">${[['1', tr('Create your profile'), tr('Add photos, languages, dates and what you are looking for. It takes about ten minutes.')],
    ['2', tr('Swipe and match'), tr('Like the profiles that fit. When the feeling is mutual, chat opens and you can get to know each other.')],
    ['3', tr('Plan the placement'), tr('Agree on dates, hours and pocket money. PairMundo checks them against the country rules and keeps a checklist for both of you.')]]
    .map(([n, t, d]) => `<div class="card feature"><div class="step-n">${n}</div><h3>${t}</h3><p class="muted">${d}</p></div>`).join('')}</div>
    <h2 class="center" style="margin:36px 0 16px">${tr('Why families and au pairs choose PairMundo')}</h2>
    <div class="grid">
      ${[['🔥', tr('Swipe to match'), tr("Swipe right to like, left to pass, up to super like. When you both like each other it's a match.")],
    ['🎯', tr('Smart matching'), tr('A match score that weighs languages, dates, childcare experience, destination wishes and program eligibility, with the reasons shown.')],
    ['⭐', tr('Two-way reviews'), tr('Families and au pairs rate each other after a real placement. Reviews stay hidden until both sides submit, so they are honest.')],
    ['🛂', tr('Program rules built in'), tr('Age limits, maximum hours and minimum pocket money for each country are checked before a placement can be agreed.')],
    ['💬', tr('Safe messaging'), tr('Chat opens only when you match, so nobody can message you out of the blue. Report anything suspicious in one click.')],
    ['✅', tr('Placement checklist'), tr('Contract, visa, insurance, travel, language course and check-ins tracked for both sides.')],
    ['🛡️', tr('Verified profiles'), tr('Members can verify their ID with a passport or ID card and a selfie, and program staff check references and backgrounds. The badges show on every profile.')],
    ['🌍', tr('In your language'), tr('PairMundo speaks English, Swedish, Spanish, French, German and Portuguese, and so do the emails it sends you.')]]
    .map(([i, t, d]) => `<div class="card feature"><div class="icon">${i}</div><h3>${t}</h3><p class="muted">${d}</p></div>`).join('')}
    </div>
    <section class="card wait-card" style="margin-top:32px"><h2>${tr('Get the app at launch')}</h2>${waitForm('wait2')}<div id="waitMsg2"></div></section>`);
  // Someone who scanned a flyer came for the waitlist, so take them straight to it.
  if (new URLSearchParams(location.search).get('src')) {
    adSource();
    const card = document.getElementById('wait1');
    card.scrollIntoView({ block: 'center' });
    card.querySelector('select').value = new URLSearchParams(location.search).get('role') === 'aupair' ? 'aupair' : 'family';
  }
  for (const n of [1, 2]) {
    const f = document.getElementById(`wait${n}`);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const $msg = document.getElementById(`waitMsg${n}`);
      f.querySelector('button').disabled = true;
      try {
        await api('/waitlist', { method: 'POST', body: { ...formData(f), country: (navigator.language.split('-')[1] || '').toUpperCase() || undefined, source: adSource() } });
        f.hidden = true;
        $msg.innerHTML = `<div class="alert ok">✓ ${tr("You're on the list! Check your inbox for a confirmation email.")}</div>`;
      } catch (err) { f.querySelector('button').disabled = false; $msg.innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
    };
  }
}

views.login = () => {
  render(`<div class="card" style="max-width:420px;margin:32px auto"><h1>${tr('Sign in')}</h1>
    <form id="f"><div class="field"><label>${tr('Email')}</label><input name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label>${tr('Password')}</label><input name="password" type="password" required autocomplete="current-password"></div>
    <div id="err"></div><button class="btn" style="width:100%">${tr('Sign in')}</button></form>
    <p class="small"><a href="#/forgot">${tr('Forgot password?')}</a></p>
    <p class="muted small">${tr('New here?')} <a href="#/register">${tr('Create an account')}</a>${['localhost', '127.0.0.1'].includes(location.hostname) ? '<br>Demo: maria@aupair.test, millers@aupair.test or admin@aupair.test, password <code>password123</code>.' : ''}</p></div>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/login', { method: 'POST', body: formData(e.target) }); await refreshMe(); go('#/'); }
    catch (err) { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
};

views.register = (_, query) => {
  const role = query.get('role') || 'family';
  render(`<div class="card" style="max-width:480px;margin:32px auto"><h1>${tr('Create your account')}</h1>
    <form id="f">
      <div class="field"><label>${tr('I am')}</label><select name="role">
        <option value="family" ${role === 'family' ? 'selected' : ''}>${tr('A host family')}</option>
        <option value="aupair" ${role === 'aupair' ? 'selected' : ''}>${tr('An au pair')}</option></select></div>
      <div class="field"><label>${tr('Name')}</label><input name="name" required placeholder="${tr('e.g. Maria Lopez or The Smith Family')}"></div>
      <div class="form-grid"><div class="field"><label>${tr('Country you live in')}</label><select name="country" required>${options(COUNTRIES, '', tr('Choose…'))}</select></div>
      <div class="field"><label>${tr('City')}</label><input name="city"></div></div>
      <div class="field"><label>${tr('Email')}</label><input name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label>${tr('Password')}</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <div id="err"></div><button class="btn" style="width:100%">${tr('Create account')}</button>
      <p class="muted small" style="text-align:center">${tr('By creating an account you agree to the {terms} and the {privacy}.', { terms: `<a href="/terms" target="_blank">${tr('Terms of Use')}</a>`, privacy: `<a href="/privacy" target="_blank">${tr('Privacy Policy')}</a>` })}</p></form></div>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/register', { method: 'POST', body: { ...formData(e.target), source: adSource() } }); await refreshMe(); toast(tr('Welcome! Check your email for your code.')); go('#/verify'); }
    catch (err) { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
};

const errBox = (err) => { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; };

views.forgot = () => {
  render(`<div class="card" style="max-width:420px;margin:32px auto"><h1>${tr('Forgot password')}</h1>
    <form id="f1"><p class="muted">${tr("Enter the email you signed up with. We'll send you a 6-digit code to set a new password.")}</p>
      <div class="field"><label>${tr('Email')}</label><input name="email" type="email" required autocomplete="email"></div>
      <button class="btn" style="width:100%">${tr('Send code')}</button></form>
    <form id="f2" hidden><div class="alert ok" id="sentNote"></div>
      <div class="field"><label>${tr('6-digit code')}</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required></div>
      <div class="field"><label>${tr('New password')}</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <button class="btn" style="width:100%">${tr('Set new password')}</button></form>
    <div id="err"></div></div>`);
  let email = '';
  document.getElementById('f1').onsubmit = async (e) => {
    e.preventDefault(); email = e.target.email.value.trim();
    try {
      await api('/auth/forgot', { method: 'POST', body: { email } });
      e.target.hidden = true; document.getElementById('f2').hidden = false;
      document.getElementById('sentNote').textContent = tr('If {email} has an account, a code is on its way. Check your inbox and spam folder.', { email });
    } catch (err) { errBox(err); }
  };
  document.getElementById('f2').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/reset', { method: 'POST', body: { email, ...formData(e.target) } }); await refreshMe(); toast(tr('Password changed')); go('#/'); }
    catch (err) { errBox(err); }
  };
};

views.verify = async () => {
  await refreshMe();
  if (me.user.email_verified) { render(`<div class="card" style="max-width:420px;margin:32px auto"><div class="alert ok">${tr('Your email is confirmed.')}</div><a class="btn" href="#/">${tr('Continue')}</a></div>`); return; }
  render(`<div class="card" style="max-width:420px;margin:32px auto"><h1>${tr('Confirm your email')}</h1>
    <p>${tr('We sent a 6-digit code to {email}. Enter it so you can like people and send messages.', { email: `<strong>${esc(me.user.email)}</strong>` })}</p>
    <form id="f"><div class="field"><label>${tr('6-digit code')}</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required></div>
    <div id="err"></div><button class="btn" style="width:100%">${tr('Confirm')}</button></form>
    <p class="small"><button class="btn ghost sm" id="resend">${tr('Send a new code')}</button> <span class="muted">${tr("Can't find it? Check your spam folder.")}</span></p></div>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/verify-email', { method: 'POST', body: formData(e.target) }); await refreshMe(); toast(tr('Email confirmed')); go('#/'); }
    catch (err) { errBox(err); }
  };
  document.getElementById('resend').onclick = async () => { await api('/auth/resend-verification', { method: 'POST' }); toast(tr('A new code is on its way')); };
};

views.account = async () => {
  await refreshMe();
  const [{ blocked }, idc] = await Promise.all([api('/blocks'), api('/me/id-check').catch(() => ({ available: false }))]);
  if (idc.verified && !me.user.verification?.id) await refreshMe();
  const idCard = idc.verified ? `<p style="color:var(--ok)">✔ ${tr('ID verified')}</p>`
    : !idc.available ? `<p class="muted small">${tr('ID checks are coming soon.')}</p>`
    : `<p class="muted small">${tr('Scan your passport or ID card and take a selfie. Your profile then shows the ID verified badge, which helps families and au pairs trust you.')}</p>
      ${idc.status === 'processing' ? `<div class="alert info">${tr("We're checking your ID. This usually takes a few minutes.")}</div>` : ''}
      ${idc.status === 'requires_input' && idc.error ? `<div class="alert warning">${tr("Your last check didn't go through. Try again with a clear, well-lit photo of your document.")}</div>` : ''}
      <div id="idErr"></div>${idc.status !== 'processing' ? `<button class="btn" id="idCheck">🪪 ${tr('Verify my ID')}</button>` : ''}
      <p class="muted small">${tr('Stripe runs the check and keeps your document. PairMundo only learns whether it passed.')}</p>`;
  render(`<h1>${tr('Account and safety')}</h1>
    <div class="card"><h2>${tr('Email')}</h2><p>${esc(me.user.email)} ${me.user.email_verified ? `<span class="chip ok">✓ ${tr('Confirmed')}</span>` : `<a class="chip warn" href="#/verify">${tr('Not confirmed yet. Click to enter your code.')}</a>`}</p></div>
    <div class="card"><h2>${tr('ID check')}</h2>${idCard}</div>
    <div class="card"><h2>${tr('Blocked people')}</h2>${blocked.length ? blocked.map((u) => `<div class="row" style="padding:6px 0">${avatar(u, 'sm')}<strong style="flex:1">${esc(u.name)}</strong>
      <button class="btn ghost sm" data-unblock="${u.id}">${tr('Unblock')}</button></div>`).join('') : `<p class="muted">${tr("You haven't blocked anyone.")}</p>`}</div>
    <div class="card"><h2>${tr('Delete account')}</h2><p class="muted small">${tr('This permanently deletes your profile, photos, matches, messages, placements and reviews.')}</p>
      <form id="del"><div class="field"><label>${tr('Your password')}</label><input name="password" type="password" required autocomplete="current-password"></div>
      <div id="err"></div><button class="btn danger">${tr('Delete my account')}</button></form></div>`);
  const $id = document.getElementById('idCheck');
  if ($id) $id.onclick = async () => {
    $id.disabled = true;
    try { location.href = (await api('/me/id-check', { method: 'POST', body: { from: 'web' } })).url; }
    catch (e) { $id.disabled = false; document.getElementById('idErr').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  };
  document.querySelectorAll('[data-unblock]').forEach((b) => { b.onclick = async () => {
    if (!confirm(tr('Unblock this person? You will be able to see each other again.'))) return;
    await api(`/users/${b.dataset.unblock}/block`, { method: 'DELETE' }); views.account();
  }; });
  document.getElementById('del').onsubmit = async (e) => {
    e.preventDefault();
    if (!confirm(tr('Delete your account? This cannot be undone.'))) return;
    try { await api('/me', { method: 'DELETE', body: formData(e.target) }); me = null; toast(tr('Your account was deleted')); go('#/'); }
    catch (err) { errBox(err); }
  };
};

/** Liking and messaging need a confirmed email; send people to enter their code. */
const needsCode = (e) => { if (e.data?.code !== 'email_unverified') return false; toast(e.message); go('#/verify'); return true; };

const blockUser = async (u, reason) => {
  if (!confirm(tr("Block {name}? You won't see each other anywhere, and your chat closes. They aren't told.", { name: u.name }))) return false;
  await api(`/users/${u.id}/block`, { method: 'POST', body: reason ? { reason } : {} });
  await refreshMe(); toast(tr('{name} is blocked', { name: u.name }));
  return true;
};

views.logout = async () => { await api('/auth/logout', { method: 'POST' }); me = null; renderNav(); go('#/'); };

// ---------- search ----------
function resultCard(r) {
  const u = r.user; const p = r.profile || {};
  const sub = u.role === 'aupair'
    ? [p.age && trn(p.age, '{n} year old', '{n} years old'), p.nationality && cname(p.nationality), p.childcare_years && trn(p.childcare_years, '{n} year of childcare', '{n} years of childcare')].filter(Boolean).join(' · ')
    : [cname(u.country), u.city, p.children?.length && `${trn(p.children.length, '{n} child', '{n} children')} (${p.children.map((c) => c.age).join(', ')})`].filter(Boolean).join(' · ');
  const langs = u.role === 'aupair' ? (p.languages || []).map((l) => langName(l.code)) : (p.languages || []).map((l) => langName(l));
  return `<a class="card" href="#/u/${u.id}" style="display:block;color:inherit;text-decoration:none">
    <div class="row" style="align-items:flex-start">${avatar(u)}<div style="flex:1;min-width:0">
      <div class="spread"><strong>${esc(u.name)}</strong>${r.match ? scoreBadge(r.match.score) : ''}</div>
      <div class="muted small">${sub}</div><div class="small">${stars(r.rating?.avg)} ${r.rating?.count ? `<span class="muted">(${r.rating.count})</span>` : ''}</div></div></div>
    <div class="chips" style="margin-top:10px">${langs.slice(0, 4).map((l) => `<span class="chip">${esc(l)}</span>`).join('')}
      ${u.role === 'aupair' && p.drivers_license ? `<span class="chip">🚗 ${tr('Driver')}</span>` : ''}
      ${u.role === 'aupair' && p.available_from ? `<span class="chip">${tr('From {date}', { date: fmtDate(p.available_from) })}</span>` : ''}
      ${u.role === 'family' && p.start_date ? `<span class="chip">${tr('Starts {date}', { date: fmtDate(p.start_date) })}</span>` : ''}</div>
    ${r.match?.reasons?.length ? `<div class="small" style="margin-top:8px;color:var(--ok)">✓ ${esc(r.match.reasons.slice(0, 2).join(' · '))}</div>` : ''}
    ${r.match?.warnings?.length ? `<div class="small" style="color:var(--warn)">⚠ ${esc(r.match.warnings[0])}</div>` : ''}
    <div class="small" style="margin-top:6px">${verifyBadges(u.verification)}</div></a>`;
}

views.search = async (_, query) => {
  const isFamily = me.user.role === 'family';
  const q = Object.fromEntries(query.entries());
  render(`<h1>${isFamily ? tr('Find your au pair') : tr('Find your host family')}</h1>
    <div class="cols"><form class="card" id="filters">
      <div class="field"><label>${tr('Keyword')}</label><input name="q" value="${esc(q.q)}" placeholder="${tr('name, city, interests')}"></div>
      <div class="field"><label>${isFamily ? tr('Lives in') : tr('Family country')}</label><select name="country">${options(COUNTRIES, q.country, tr('Anywhere'))}</select></div>
      ${isFamily ? `<div class="field"><label>${tr('Nationality')}</label><select name="nationality">${options(COUNTRIES, q.nationality, tr('Any'))}</select></div>` : ''}
      <div class="field"><label>${tr('Language')}</label><select name="language">${options(LANGS, q.language, tr('Any'))}</select></div>
      ${isFamily ? `<div class="form-grid" style="grid-template-columns:1fr 1fr"><div class="field"><label>${tr('Min age')}</label><input type="number" name="min_age" min="17" max="35" value="${esc(q.min_age)}"></div>
        <div class="field"><label>${tr('Max age')}</label><input type="number" name="max_age" min="17" max="35" value="${esc(q.max_age)}"></div></div>
        <div class="field"><label>${tr('Available by')}</label><input type="date" name="available_by" value="${esc(q.available_by)}"></div>
        <div class="field"><label class="check"><input type="checkbox" name="driver" value="1" ${q.driver ? 'checked' : ''}> ${tr("Has driver's license")}</label></div>` : ''}
      <div class="field"><label>${tr('Minimum rating')}</label><select name="min_rating">${options({ 3: '3★ and up', 4: '4★ and up', 4.5: '4.5★ and up' }, q.min_rating, tr('Any'), false)}</select></div>
      <div class="field"><label class="check"><input type="checkbox" name="verified" value="1" ${q.verified ? 'checked' : ''}> ${tr('ID verified only')}</label></div>
      <div class="field"><label>${tr('Sort by')}</label><select name="sort">${options({ match: 'Best match', rating: 'Highest rated', recent: 'Recently active' }, q.sort || 'match', null, false)}</select></div>
      <button class="btn" style="width:100%">${tr('Search')}</button></form>
    <div id="results"><div class="empty">${tr('Searching…')}</div></div></div>`);
  document.getElementById('filters').onsubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(Object.entries(formData(e.target)).filter(([, v]) => v));
    go(`#/search?${params}`);
  };
  const { total, results } = await api(`/search?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`);
  document.getElementById('results').innerHTML = `<p class="muted">${trn(total, '{n} result', '{n} results')}</p>
    <div class="grid">${results.map(resultCard).join('') || `<div class="empty">${tr('No one matches these filters yet. Try widening them.')}</div>`}</div>`;
};

// ---------- public profile ----------
// ---------- au pair profile as a "Hi, I'm ..." letter ----------
// Laid out like the letters au pairs make for host families: a polaroid photo and pastel cards. Empty cards are left out.
function posterHeader(u, p, badge) {
  const from = p.nationality || u.country;
  return `<div class="poster-head"><div class="poster-hi">${tr('Hi!')}</div>
    <div class="poster-name">${tr("I'm {name}", { name: esc(firstName(u.name)) })}${u.verification.id ? ` <span class="tick" title="${tr('ID verified')}">✔</span>` : ''}</div>
    ${from ? `<div class="poster-pill">${tr('Au pair from {country}', { country: esc(country(from)) })} ${flag(from)}</div>` : ''}
    <div class="polaroid big">${gallery(u, { cls: 'polaroid-photo' })}<div class="polaroid-cap">${tr('Big dreams · Good vibes · New adventures')}</div></div>
    ${badge}</div>`;
}
function posterBody(u, p) {
  const sec = (tint, icon, title, body) => (body ? `<section class="poster-card ${tint}"><h3><span>${icon}</span> ${title}</h3><div class="poster-in">${body}</div></section>` : '');
  const row = (icon, text) => (text ? `<div class="poster-row"><span>${icon}</span><div>${text}</div></div>` : '');
  const para = (text) => (text ? `<p class="poster-p">${esc(text)}</p>` : '');
  const place = [u.city, country(u.country)].filter(Boolean).join(', ');
  const months = p.duration_months && trn(p.duration_months, '{n} month', '{n} months');
  const hobbies = (p.hobbies || []).filter((k) => HOBBIES[k]);
  const extra = (u.photos || []).slice(1, 4);
  return `<div class="poster-body">
    ${sec('green', '🙂', tr('About me'), [p.age && row('🎂', trn(p.age, '{n} year old', '{n} years old')),
      p.nationality && row(flag(p.nationality) || '🌍', tr('From {country}', { country: esc(country(p.nationality)) })),
      place && row('📍', tr('Currently in {place}', { place: esc(place) })),
      p.traits?.length && row('♡', p.traits.map((k) => (TRAITS[k] ? tr(TRAITS[k]) : esc(k))).join(' · ')), para(p.bio)].filter(Boolean).join(''))}
    ${sec('peach', '🧸', tr('My experience with children'), [p.childcare_years && row('⭐', trn(p.childcare_years, '{n} year of childcare experience', '{n} years of childcare experience')),
      ...(p.age_groups || []).map((g) => row('👶', AGE_GROUPS[g] ? tr(AGE_GROUPS[g]) : esc(g))),
      p.skills?.length && `<div class="poster-sub">${tr('I can help with:')}</div><ul class="poster-list">${p.skills.map((s) => `<li>${SKILLS[s] ? tr(SKILLS[s]) : esc(s)}</li>`).join('')}</ul>`].filter(Boolean).join(''))}
    ${sec('yellow', '🗣️', tr('Languages'), (p.languages || []).map((l) => row('💬', `${esc(langName(l.code))} · ${l.level === 'native' ? tr('native') : esc(l.level)}`)).join(''))}
    ${sec('blue', '✨', tr('Good to know'), [p.drivers_license && row('🚗', tr("Has a driver's license")), p.non_smoker && row('🚭', tr('Non-smoker')),
      p.ok_with_pets && row('🐾', tr('Happy to live with pets')), p.education && row('🎓', esc(p.education))].filter(Boolean).join(''))}
    ${sec('teal', '🌿', tr('Hobbies and personality'), hobbies.length ? `<div class="poster-grid">${hobbies.map((k) => row(HOBBIES[k][0], tr(HOBBIES[k][1]))).join('')}</div>` : '')}
    ${sec('pink', '🎯', tr('My goal'), [para(p.goal), p.preferred_countries?.length && row('🌍', tr('Would love to go to {places}', { places: p.preferred_countries.map(cname).join(', ') }))].filter(Boolean).join(''))}
    ${sec('lilac', '🏡', tr('My ideal family'), para(p.ideal_family))}
    ${sec('yellow', '📅', tr('Available'), [p.available_from && row('🗓️', tr('From {date}', { date: fmtDate(p.available_from) })), months && row('⏳', tr('For {stay}', { stay: months }))].filter(Boolean).join(''))}
    ${extra.length ? `<div class="poster-strip">${extra.map((src) => `<div class="polaroid"><img src="${esc(src)}" alt="" draggable="false"></div>`).join('')}</div>` : ''}
    <div class="poster-end"><strong>${tr('Looking for my next host family!')} ♡</strong><span>${tr('Like my profile if you think we could be a good match.')}</span></div></div>`;
}

views.u = async ([id]) => {
  const d = await api(`/users/${id}`);
  const u = d.user; const p = d.profile || {};
  const mine = me.user.id === u.id;
  const canAct = !mine && me.user.role !== 'admin' && me.user.role !== u.role;
  const req = d.request;
  const matched = req?.status === 'accepted';
  const likesMe = req?.status === 'pending' && req.from_user === u.id;
  const iLiked = req?.status === 'pending' && req.from_user === me.user.id;
  let action = '';
  if (d.blocked) action = `<div class="alert warning">${tr("You blocked this person. They can't see you or message you.")} <button class="btn secondary sm" id="unblock">${tr('Unblock')}</button></div>`;
  else if (canAct) {
    if (matched) action = `<div class="row center-row"><button class="btn" id="msg">💬 ${tr('Message')}</button><button class="btn secondary" id="place">🧳 ${tr('Propose placement')}</button></div>`;
    else if (iLiked) action = `<div class="liked-note">♥ ${tr("You liked them. You'll match if they like you back.")}</div>`;
    else action = `${likesMe ? `<div class="liked-note">💛 ${tr('They like you! Like them back to match.')}</div>` : ''}
      <div class="deck-actions"><button class="round lg nope" data-swipe="pass" title="${tr('Pass')}">✕</button>
      <button class="round sm super" data-swipe="super" title="${tr('Super like')}">★</button><button class="round lg like" data-swipe="like" title="${tr('Like')}">♥</button></div>`;
  }
  const yes = (v) => (v ? tr('Yes') : tr('No'));
  const months = p.duration_months && trn(p.duration_months, '{n} month', '{n} months');
  const facts = [
    ['📍', tr('Location'), [u.city, cname(u.country)].filter(Boolean).join(', ')], ['👶', tr('Children'), p.children?.length ? p.children.map((c) => trn(c.age, '{n} year', '{n} years')).join(', ') : '—'],
    ['📅', tr('Start date'), fmtDate(p.start_date)], ['⏳', tr('Stay length'), months], ['⏰', tr('Hours / week'), p.weekly_hours],
    ['💶', tr('Pocket money / month'), p.pocket_money], ['🚗', tr('Needs a driver'), yes(p.needs_driver)], ['🐾', tr('Pets'), yes(p.has_pets)], ['🛏️', tr('Private room'), yes(p.private_room)],
  ];
  const preview = mine ? `<div class="alert info preview-note"><div><strong>👁 ${u.role === 'aupair' ? tr('This is how host families see your profile.') : tr('This is how au pairs see your profile.')}</strong>
      ${p.visible === 0 ? `<div class="small">${tr('Your profile is hidden right now, so nobody can find you. You can show it again in your profile settings.')}</div>` : ''}</div>
      <a class="btn sm" href="#/profile">${tr('Edit profile')}</a></div>` : '';
  const ap = u.role === 'aupair';
  const score = d.match ? `<div class="poster-score ${d.match.score >= 75 ? 'high' : ''}">${tr('{n}% match', { n: d.match.score })}</div>` : '';
  const stats = `${d.rating.count ? `★ ${d.rating.avg} (${trn(d.rating.count, '{n} review', '{n} reviews')}) · ` : ''}${trn(d.placements_completed, '{n} completed placement', '{n} completed placements')}`;
  render(`${preview}<div class="profile-layout${ap ? ' poster' : ''}"><div class="profile-left">
      ${ap ? `${posterHeader(u, p, score)}<div class="muted small center">${stats}</div>` : `<div class="profile-hero">${gallery(u, { cls: 'hero-gallery' })}<div class="card-shade"></div>
        ${d.match ? `<div class="card-score ${d.match.score >= 75 ? 'high' : ''}">${tr('{n}% match', { n: d.match.score })}</div>` : ''}
        <div class="card-info static"><h2>${esc(u.name)}${p.age && u.role === 'aupair' ? ` <span class="age">${p.age}</span>` : ''} ${u.verification.id ? `<span class="tick" title="${tr('ID verified')}">✔</span>` : ''}</h2>
          <div class="sub">${u.role === 'aupair' ? tr('Au pair') : tr('Host family')} · ${flag(u.country)} ${esc([u.city, country(u.country)].filter(Boolean).join(', '))}</div>
          <div class="sub">${d.rating.count ? `★ ${d.rating.avg} (${trn(d.rating.count, '{n} review', '{n} reviews')}) · ` : ''}${trn(d.placements_completed, '{n} completed placement', '{n} completed placements')}</div></div></div>`}
      ${action}
      <div class="row center-row small">${!mine ? `<button class="btn ghost sm" id="fav">${d.favorite ? `♥ ${tr('Saved')}` : `♡ ${tr('Save')}`}</button><button class="btn ghost sm" id="report">⚑ ${tr('Report')}</button>${d.blocked ? '' : `<button class="btn ghost sm" id="block">🚫 ${tr('Block')}</button>`}` : ''}
        <button class="btn ghost sm" onclick="history.back()">← ${tr('Back')}</button></div>
    </div><div class="profile-right">
      ${d.match ? `<div class="card"><h3>${tr('Why you match')}</h3>
        ${d.match.reasons.map((r) => `<div class="small" style="color:var(--ok)">✓ ${esc(r)}</div>`).join('')}
        ${d.match.warnings.map((r) => `<div class="small" style="color:var(--warn)">⚠ ${esc(r)}</div>`).join('')}</div>` : ''}
      ${ap ? `${verifyBadges(u.verification) ? `<div style="margin-bottom:10px">${verifyBadges(u.verification)}</div>` : ''}${posterBody(u, p)}` : `<div class="card"><h3>${tr('About us')}</h3><p style="white-space:pre-wrap;margin-top:0">${esc(p.bio) || `<span class="muted">${tr('No description yet.')}</span>`}</p>
        <div>${verifyBadges(u.verification) || `<span class="muted small">${tr('Not yet verified')}</span>`}</div></div>
      <div class="card"><h3>${tr('Basics')}</h3><div class="facts">${facts.filter(([, , v]) => v != null && v !== '').map(([i, k, v]) => `<div class="fact"><span>${i}</span><div><div class="muted small">${k}</div>${esc(v)}</div></div>`).join('')}</div></div>
      <div class="card"><h3>${tr('Languages at home')}</h3><div class="chips">${(p.languages || []).map((l) => `<span class="chip">${esc(langName(l))}</span>`).join('')}</div>
          <h3 style="margin-top:12px">${tr('Au pair must speak')}</h3><div class="chips">${(p.required_languages || []).map((l) => `<span class="chip">${esc(langName(l))}</span>`).join('') || `<span class="muted">${tr('No requirement')}</span>`}</div></div>`}
      <div class="card"><h3>${tr('Reviews')}</h3>${ratingBreakdown(d.rating)}
        ${d.reviews.map((r) => reviewItem(r, mine)).join('') || `<div class="empty">${tr('No reviews yet. Reviews come only from real placements.')}</div>`}</div>
    </div></div>`);

  const on = (sel, fn) => { const el = document.getElementById(sel); if (el) el.onclick = fn; };
  document.querySelectorAll('[data-swipe]').forEach((b) => { b.onclick = async () => {
    try {
      const res = await api('/swipe', { method: 'POST', body: { target_id: u.id, direction: b.dataset.swipe } });
      await refreshMe();
      if (res.matched) { showMatch(u, res.conversation_id); views.u([id]); }
      else if (b.dataset.swipe === 'pass') { toast(tr('Passed')); history.back(); }
      else { toast(b.dataset.swipe === 'super' ? `★ ${tr('Super like sent')}` : `♥ ${tr('Liked')}`); views.u([id]); }
    } catch (e) { if (!needsCode(e)) toast(e.message); }
  }; });
  on('block', async () => { if (await blockUser(u)) history.back(); });
  on('unblock', async () => { await api(`/users/${u.id}/block`, { method: 'DELETE' }); views.u([id]); });
  on('msg', async () => {
    try { const c = await api('/conversations', { method: 'POST', body: { user_id: u.id } }); go(`#/messages/${c.id}`); }
    catch (e) { if (!needsCode(e)) toast(e.message); }
  });
  on('place', () => go(`#/new-placement/${u.id}`));
  on('fav', async () => { await api(`/favorites/${u.id}`, { method: d.favorite ? 'DELETE' : 'POST' }); views.u([id]); });
  on('report', async () => {
    const reason = prompt(tr('What is wrong with this profile? Our team reviews every report.'));
    if (reason) { await api('/reports', { method: 'POST', body: { target_user_id: u.id, reason } }); toast(tr('Thanks, our team will look into it.')); }
  });
  bindReviewActions(() => views.u([id]));
};

function ratingBreakdown(r) {
  if (!r.count) return '';
  return `<div class="form-grid" style="margin-bottom:12px">${Object.entries(r.criteria).map(([k, v]) => `<div class="small">
    <div class="spread"><span>${CRIT_LABEL[k] ? tr(CRIT_LABEL[k]) : k}</span><strong>${v}</strong></div><div class="bar"><span style="width:${v * 20}%"></span></div></div>`).join('')}</div>`;
}
function reviewItem(r, canRespond) {
  return `<div style="border-top:1px solid var(--line);padding:12px 0">
    <div class="spread"><div>${stars(r.overall)} <span class="muted small">${tr('by {name}', { name: `<a href="#/u/${r.reviewer_id}">${esc(r.reviewer_name)}</a>` })} · ${cname(r.country)} · ${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}</span></div>
      <button class="btn ghost sm" data-report-review="${r.id}">${tr('Report')}</button></div>
    <p style="white-space:pre-wrap;margin:6px 0">${esc(r.comment)}</p>
    ${r.response ? `<div class="alert info small"><strong>${tr('Response:')}</strong> ${esc(r.response)}</div>`
    : canRespond ? `<button class="btn ghost sm" data-respond="${r.id}">${tr('Respond publicly')}</button>` : ''}</div>`;
}
function bindReviewActions(reload) {
  document.querySelectorAll('[data-report-review]').forEach((b) => { b.onclick = async () => {
    const reason = prompt(tr('Why should this review be checked?'));
    if (reason) { await api('/reports', { method: 'POST', body: { review_id: Number(b.dataset.reportReview), reason } }); toast(tr('Reported to moderators.')); }
  }; });
  document.querySelectorAll('[data-respond]').forEach((b) => { b.onclick = async () => {
    const response = prompt(tr('Your public response:'));
    if (response) { try { await api(`/reviews/${b.dataset.respond}/response`, { method: 'POST', body: { response } }); reload(); } catch (e) { toast(e.message); } }
  }; });
}

// ---------- my profile ----------
views.profile = async () => {
  await refreshMe();
  const u = me.user; const p = me.profile || {};
  const isAp = u.role === 'aupair';
  const chipSet = (name, dict, selected) => `<div class="chips" data-chipset="${name}">${Object.entries(dict).map(([k, v]) =>
    `<button type="button" class="chip chip-toggle ${(selected || []).includes(k) ? 'on' : ''}" data-v="${k}">${esc(tr(v))}</button>`).join('')}</div>`;
  const pass = me.pass;
  render(`<div class="spread"><h1>${tr('My profile')}</h1><span><a href="#/account">🔒 ${tr('Account and safety')}</a> · <button type="button" class="btn secondary sm" id="preview">👁 ${tr('Preview my profile')}</button></span></div>
  ${u.role === 'family' && pass && (pass.required || pass.active) ? `<div class="card spread"><span>💛 <strong>Family Pass</strong> · ${pass.active ? tr('active until {date}', { date: fmtDate(pass.ends_at) }) : tr('not active')}</span>
    <a class="btn sm" href="#/family-pass">${pass.active ? tr('Details') : tr('Get it')}</a></div>` : ''}
  ${!u.verification?.id ? `<a class="alert info nudge" href="#/account">🪪 ${tr('Verify your ID to get the ID verified badge on your profile.')}</a>` : ''}
  <div class="card"><h2>${tr('Photos')}</h2><p class="muted small">${isAp ? tr('Your first photo is what people see when they swipe. Add up to 6; clear, smiling, recent photos work best. Photos with children need their parents\' permission.') : tr('Your first photo is what people see when they swipe. Add up to 6; clear, smiling, recent photos work best, and a family photo plus your home helps.')}</p>
    <div class="photo-grid" id="photoGrid"></div></div>
  <form id="f"><div class="card"><h2>${tr('Basics')}</h2><div class="form-grid">
      <div class="field"><label>${tr('Name')}</label><input name="name" value="${esc(u.name)}" required></div>
      <div class="field"><label>${tr('Country')}</label><select name="country">${options(COUNTRIES, u.country, tr('Choose…'))}</select></div>
      <div class="field"><label>${tr('City')}</label><input name="city" value="${esc(u.city)}"></div>
</div>
      <div class="field"><label>${isAp ? tr('About me') : tr('About our family')}</label><textarea name="bio" maxlength="5000">${esc(p.bio)}</textarea></div>
      <label class="check"><input type="checkbox" name="visible" ${p.visible !== 0 ? 'checked' : ''}> ${tr('Show my profile in search')}</label></div>
  ${isAp ? `<div class="card"><h2>${tr('Au pair details')}</h2><div class="form-grid">
      <div class="field"><label>${tr('Date of birth')}</label><input type="date" name="birth_date" value="${esc(p.birth_date)}"></div>
      <div class="field"><label>${tr('Nationality')}</label><select name="nationality">${options(COUNTRIES, p.nationality, tr('Choose…'))}</select></div>
      <div class="field"><label>${tr('Years of childcare experience')}</label><input type="number" step="0.5" min="0" name="childcare_years" value="${esc(p.childcare_years)}"></div>
      <div class="field"><label>${tr('Available from')}</label><input type="date" name="available_from" value="${esc(p.available_from)}"></div>
      <div class="field"><label>${tr('Stay length (months)')}</label><input type="number" min="1" max="24" name="duration_months" value="${esc(p.duration_months)}"></div>
      <div class="field"><label>${tr('Education')}</label><input name="education" value="${esc(p.education)}"></div>
      <div class="field"><label>${tr('Intro video URL')}</label><input name="video_url" value="${esc(p.video_url)}"></div></div>
      <div class="row"><label class="check"><input type="checkbox" name="drivers_license" ${p.drivers_license ? 'checked' : ''}> ${tr("Driver's license")}</label>
        <label class="check"><input type="checkbox" name="non_smoker" ${p.non_smoker !== 0 ? 'checked' : ''}> ${tr('Non-smoker')}</label>
        <label class="check"><input type="checkbox" name="ok_with_pets" ${p.ok_with_pets !== 0 ? 'checked' : ''}> ${tr('OK with pets')}</label></div>
      <h3 style="margin-top:16px">${tr('Languages')}</h3><div id="langs"></div><button type="button" class="btn ghost sm" id="addLang">+ ${tr('Add language')}</button>
      <h3 style="margin-top:16px">${tr('Experience with')}</h3>${chipSet('age_groups', AGE_GROUPS, p.age_groups)}
      <h3 style="margin-top:16px">${tr('Skills')}</h3>${chipSet('skills', SKILLS, p.skills)}
      <h3 style="margin-top:16px">${tr("Countries I'd like to go to")}</h3><p class="muted small">${tr("Leave empty if you're open to anywhere.")}</p>
      ${chipSet('preferred_countries', Object.fromEntries(PROGRAM_CODES.map((c) => [c, cname(c)])), p.preferred_countries)}
      <h3 style="margin-top:16px">${tr('Words that describe me')}</h3>${chipSet('traits', TRAITS, p.traits)}
      <h3 style="margin-top:16px">${tr('Hobbies')}</h3>${chipSet('hobbies', Object.fromEntries(Object.entries(HOBBIES).map(([k, [i, l]]) => [k, `${i} ${tr(l)}`])), p.hobbies)}
      <div class="field" style="margin-top:16px"><label>${tr('My goal as an au pair')}</label><textarea name="goal" maxlength="400" placeholder="${tr('For example: improve my English and see more of the world.')}">${esc(p.goal)}</textarea></div>
      <div class="field"><label>${tr('My ideal host family')}</label><textarea name="ideal_family" maxlength="400" placeholder="${tr('For example: a warm family with young children who likes the outdoors.')}">${esc(p.ideal_family)}</textarea></div></div>`
    : `<div class="card"><h2>${tr('Family details')}</h2><div class="form-grid">
      <div class="field"><label>${tr("Children's ages (comma separated)")}</label><input name="children" value="${esc((p.children || []).map((c) => c.age).join(', '))}" placeholder="${tr('e.g. 2, 6')}"></div>
      <div class="field"><label>${tr('Start date')}</label><input type="date" name="start_date" value="${esc(p.start_date)}"></div>
      <div class="field"><label>${tr('Stay length (months)')}</label><input type="number" min="1" max="24" name="duration_months" value="${esc(p.duration_months)}"></div>
      <div class="field"><label>${tr('Hours per week')}</label><input type="number" min="1" max="60" name="weekly_hours" value="${esc(p.weekly_hours)}"></div>
      <div class="field"><label>${tr('Pocket money per month (local currency)')}</label><input type="number" min="0" name="pocket_money" value="${esc(p.pocket_money)}"></div></div>
      <div class="row"><label class="check"><input type="checkbox" name="needs_driver" ${p.needs_driver ? 'checked' : ''}> ${tr('We need a driver')}</label>
        <label class="check"><input type="checkbox" name="has_pets" ${p.has_pets ? 'checked' : ''}> ${tr('We have pets')}</label>
        <label class="check"><input type="checkbox" name="smoking_household" ${p.smoking_household ? 'checked' : ''}> ${tr('Someone smokes at home')}</label>
        <label class="check"><input type="checkbox" name="private_room" ${p.private_room !== 0 ? 'checked' : ''}> ${tr('Private room for the au pair')}</label></div>
      <h3 style="margin-top:16px">${tr('Languages spoken at home')}</h3>${chipSet('languages', LANGS, p.languages)}
      <h3 style="margin-top:16px">${tr('Au pair must speak')}</h3>${chipSet('required_languages', LANGS, p.required_languages)}
      <div id="programHint" style="margin-top:16px"></div></div>`}
  <div id="err"></div><button class="btn">${tr('Save profile')}</button></form>
  <div class="card spread profile-foot"><a href="#/notifications">🔔 ${tr('Notifications')}</a><a class="btn ghost sm" href="#/logout">${tr('Sign out')}</a></div>`);

  renderPhotoGrid(u.photos || []);
  document.querySelectorAll('.chip-toggle').forEach((b) => { b.onclick = () => b.classList.toggle('on'); });
  if (isAp) {
    const $langs = document.getElementById('langs');
    const addLang = (l = { code: '', level: 'B2' }) => {
      const row = document.createElement('div');
      row.className = 'row lang-row'; row.style.marginBottom = '8px';
      row.innerHTML = `<select class="lc" style="max-width:220px">${options(LANGS, l.code, tr('Language…'))}</select>
        <select class="ll" style="max-width:120px">${LEVELS.map((v) => `<option value="${v}" ${v === l.level ? 'selected' : ''}>${v === 'native' ? tr('native') : v}</option>`).join('')}</select>
        <button type="button" class="btn ghost sm">${tr('Remove')}</button>`;
      row.querySelector('button').onclick = () => row.remove();
      $langs.appendChild(row);
    };
    (p.languages?.length ? p.languages : [undefined]).forEach((l) => addLang(l));
    document.getElementById('addLang').onclick = () => addLang();
  } else if (u.country) {
    api(`/programs/${u.country}`).then((pr) => {
      const rules = pr.min_pocket_money
        ? tr('{country} rules: au pairs aged {min}-{max}, up to {hours} h/week, at least {money} {currency}/month pocket money.', { country: esc(country(pr.code)), min: pr.min_age, max: pr.max_age, hours: pr.max_weekly_hours, money: pr.min_pocket_money, currency: pr.currency })
        : tr('{country} rules: au pairs aged {min}-{max}, up to {hours} h/week.', { country: esc(country(pr.code)), min: pr.min_age, max: pr.max_age, hours: pr.max_weekly_hours });
      document.getElementById('programHint').innerHTML = (pr.status_note ? `<div class="alert ${pr.status === 'closed' ? 'error' : 'warning'} small">${esc(pr.status_note)}</div>` : '') + `<div class="alert info small">${rules} <a href="#/programs/${pr.code}">${tr('Full program guide')}</a></div>`;
    }).catch(() => {});
  }

  // Preview saves first, so it shows the profile exactly as it is after any edits.
  let previewAfter = false;
  document.getElementById('preview').onclick = () => { previewAfter = true; document.getElementById('f').requestSubmit(); };
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target; const v = formData(f);
    const chips = (name) => [...document.querySelectorAll(`[data-chipset="${name}"] .on`)].map((b) => b.dataset.v);
    const num = (x) => (x === '' || x == null ? null : Number(x));
    const profile = { bio: v.bio, visible: f.visible.checked };
    if (isAp) Object.assign(profile, {
      birth_date: v.birth_date || null, nationality: v.nationality || null, childcare_years: num(v.childcare_years) ?? 0,
      available_from: v.available_from || null, duration_months: num(v.duration_months), education: v.education, video_url: v.video_url,
      drivers_license: f.drivers_license.checked, non_smoker: f.non_smoker.checked, ok_with_pets: f.ok_with_pets.checked,
      languages: [...document.querySelectorAll('.lang-row')].map((r) => ({ code: r.querySelector('.lc').value, level: r.querySelector('.ll').value })).filter((l) => l.code),
      age_groups: chips('age_groups'), skills: chips('skills'), preferred_countries: chips('preferred_countries'),
      traits: chips('traits'), hobbies: chips('hobbies'), goal: v.goal, ideal_family: v.ideal_family,
    });
    else Object.assign(profile, {
      children: v.children.split(',').map((s) => s.trim()).filter((s) => s !== '' && !Number.isNaN(Number(s))).map((a) => ({ age: Number(a) })),
      start_date: v.start_date || null, duration_months: num(v.duration_months), weekly_hours: num(v.weekly_hours), pocket_money: num(v.pocket_money),
      needs_driver: f.needs_driver.checked, has_pets: f.has_pets.checked, smoking_household: f.smoking_household.checked, private_room: f.private_room.checked,
      languages: chips('languages'), required_languages: chips('required_languages'),
    });
    try {
      await api('/me', { method: 'PUT', body: { name: v.name, country: v.country, city: v.city, profile } });
      if (previewAfter) return go(`#/u/${u.id}`);
      toast(tr('Profile saved')); views.profile();
    } catch (err) { previewAfter = false; document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
};
function renderPhotoGrid(photos) {
  const $g = document.getElementById('photoGrid'); if (!$g) return;
  $g.innerHTML = Array.from({ length: 6 }, (_, i) => (photos[i]
    ? `<div class="photo-slot"><img src="${esc(photos[i])}" alt="">${i === 0 ? `<span class="main-tag">${tr('Main')}</span>` : `<button type="button" class="slot-btn main" data-main="${i}" title="${tr('Make main photo')}">★</button>`}
       <button type="button" class="slot-btn del" data-del="${i}" title="${tr('Remove')}">✕</button></div>`
    : `<label class="photo-slot empty">${i === photos.length ? `<span>＋<br><small>${tr('Add photo')}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" hidden>` : ''}</label>`)).join('');
  const save = async (list) => { const r = await api('/me/photos', { method: 'PUT', body: { photos: list } }); me.user.photos = r.photos; renderPhotoGrid(r.photos); };
  $g.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => confirm(tr('Remove this photo?')) && save(photos.filter((_, j) => j !== Number(b.dataset.del))); });
  $g.querySelectorAll('[data-main]').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.main); save([photos[i], ...photos.filter((_, j) => j !== i)]); }; });
  const input = $g.querySelector('input[type=file]');
  if (input) input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    const slot = input.closest('.photo-slot'); slot.innerHTML = `<span>${tr('Uploading…')}</span>`;
    try {
      const body = { data_url: await resizeImage(file) };
      const r = await api('/me/photos', { method: 'POST', body }).catch((e) => {
        // The photo shows children: post it only once the member confirms they have permission.
        if (e.data?.code !== 'child_permission' || !confirm(tr("This photo shows children. Are you their parent or guardian, or do you have their parents' permission to post it?"))) throw e;
        return api('/me/photos', { method: 'POST', body: { ...body, child_permission: true } });
      });
      me.user.photos = r.photos; renderPhotoGrid(r.photos); toast(tr('Photo added'));
    } catch (e) { toast(e.message); renderPhotoGrid(photos); }
  };
}

/** Downscale to at most 1200px on the long side and re-encode as JPEG, so uploads stay small. */
function resizeImage(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error(tr('That file is not an image we can read.')));
    img.src = URL.createObjectURL(file);
  });
}

let PROGRAM_CODES = ['US', 'DE', 'FR', 'NL', 'DK', 'NO', 'SE', 'ES', 'CH', 'GB', 'IE', 'AU', 'BE'];

// ---------- requests ----------
function requestRow(r) {
  const incoming = r.to_user === me.user.id;
  const other = incoming ? { id: r.from_user, name: r.from_name, photo_url: r.from_photo, country: r.from_country } : { id: r.to_user, name: r.to_name, photo_url: r.to_photo, country: r.to_country };
  const statusChip = { pending: `<span class="chip warn">${tr('Pending')}</span>`, accepted: `<span class="chip ok">${tr('Matched')}</span>`, declined: `<span class="chip">${tr('Declined')}</span>`, withdrawn: `<span class="chip">${tr('Withdrawn')}</span>` }[r.status];
  return `<div class="row" style="border-top:1px solid var(--line);padding:12px 0;align-items:flex-start">${avatar(other, 'sm')}
    <div style="flex:1"><div class="spread"><a href="#/u/${other.id}"><strong>${esc(other.name)}</strong></a> ${statusChip}</div>
      <div class="muted small">${cname(other.country)} · ${fmtDate(r.created_at)}</div>
      ${r.message ? `<p class="small" style="margin:4px 0;white-space:pre-wrap">${esc(r.message)}</p>` : ''}
      <div class="row">${r.status === 'pending' && incoming ? `<button class="btn sm" data-act="accept" data-id="${r.id}">${tr('Accept')}</button><button class="btn ghost sm" data-act="decline" data-id="${r.id}">${tr('Decline')}</button>` : ''}
        ${r.status === 'pending' && !incoming ? `<button class="btn ghost sm" data-act="withdraw" data-id="${r.id}">${tr('Withdraw')}</button>` : ''}
        ${r.status === 'accepted' ? `<button class="btn ghost sm" data-chat="${other.id}">${tr('Message')}</button>` : ''}</div></div></div>`;
}
function bindRequestActions(reload) {
  document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
    try { await api(`/requests/${b.dataset.id}/respond`, { method: 'POST', body: { action: b.dataset.act } }); toast({ accept: tr('Request accepted'), decline: tr('Request declined'), withdraw: tr('Request withdrawn') }[b.dataset.act]); await refreshMe(); reload(); } catch (e) { toast(e.message); }
  }; });
  document.querySelectorAll('[data-chat]').forEach((b) => { b.onclick = async () => {
    const c = await api('/conversations', { method: 'POST', body: { user_id: Number(b.dataset.chat) } }); go(`#/messages/${c.id}`);
  }; });
}
views.requests = async () => {
  const { incoming, outgoing } = await api('/requests');
  render(`<h1>${tr('Match requests')}</h1><div class="cols-2">
    <div class="card"><h2>${tr('Received')}</h2>${incoming.map(requestRow).join('') || `<div class="empty">${tr('Nothing yet.')}</div>`}</div>
    <div class="card"><h2>${tr('Sent')}</h2>${outgoing.map(requestRow).join('') || `<div class="empty">${tr("You haven't sent any requests.")} <a href="#/search">${tr('Start searching')}</a></div>`}</div></div>`);
  bindRequestActions(views.requests);
};

// ---------- messages ----------
views.messages = async ([convId]) => {
  const { conversations } = await api('/conversations');
  const active = convId ? Number(convId) : conversations[0]?.id;
  render(`<h1>${tr('Messages')}</h1><div class="card chat"><div class="chat-list">${conversations.map((c) => `<a href="#/messages/${c.id}" class="${c.id === active ? 'active' : ''}">
      ${avatar(c.other, 'sm')}<div style="min-width:0;flex:1"><div class="spread"><strong>${esc(c.other.name)}</strong>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</div>
      <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_body || tr('No messages yet'))}</div></div></a>`).join('')
    || `<div class="empty">${tr('Conversations open when you match with someone.')}</div>`}</div>
    <div class="chat-main" id="chat">${active ? '' : `<div class="empty">${tr('Pick a conversation.')}</div>`}</div></div>`);
  if (!active) return;
  const data = await api(`/conversations/${active}/messages`);
  const $chat = document.getElementById('chat');
  $chat.innerHTML = `<div class="chat-head spread"><a href="#/u/${data.other.id}"><strong>${esc(data.other.name)}</strong></a>
      <span class="muted small">${cname(data.other.country)} <button class="btn ghost sm" id="reportBlock">⚑ ${tr('Report and block')}</button></span></div>
    <div class="chat-msgs" id="msgs"></div>
    <form class="chat-form" id="send"><textarea name="body" placeholder="${tr('Write a message… (Enter to send)')}" required></textarea><button class="btn">${tr('Send')}</button></form>`;
  const $msgs = document.getElementById('msgs');
  let lastId = 0;
  const add = (list) => {
    for (const m of list) {
      $msgs.insertAdjacentHTML('beforeend', `<div class="msg ${m.sender_id === me.user.id ? 'mine' : ''}">${esc(m.body)}<time>${fmtTime(m.created_at)}</time></div>`);
      lastId = Math.max(lastId, m.id);
    }
    $msgs.scrollTop = $msgs.scrollHeight;
  };
  add(data.messages);
  const form = document.getElementById('send');
  form.body.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = form.body.value.trim(); if (!body) return;
    form.body.value = '';
    try {
      const m = await api(`/conversations/${active}/messages`, { method: 'POST', body: { body } });
      if (m.id > lastId) add([m]);
    } catch (err) { form.body.value = body; if (err.data?.code === 'pass_required') return go('#/family-pass'); if (!needsCode(err)) toast(err.message); }
  };
  document.getElementById('reportBlock').onclick = async () => {
    const reason = prompt(tr('What happened? Our safety team reviews every report. Leave empty to just block.'));
    if (reason === null) return;
    if (await blockUser(data.other, reason.trim() || null)) go('#/matches');
  };
  // Light polling for new messages while this conversation is open.
  pollTimer = setInterval(async () => {
    if (!document.getElementById('msgs')) return;
    const { messages } = await api(`/conversations/${active}/messages?after=${lastId}`);
    add(messages);
  }, 4000);
};

// ---------- placements ----------
function placementRow(p) {
  const other = me.user.id === p.aupair_id ? p.family : p.aupair;
  const status = { proposed: 'warn', confirmed: 'ok', active: 'ok', completed: '', cancelled: '' }[p.status];
  return `<a href="#/placements/${p.id}" class="row" style="border-top:1px solid var(--line);padding:10px 0;color:inherit;text-decoration:none">
    ${avatar(other, 'sm')}<div style="flex:1"><div class="spread"><strong>${me.user.role === 'admin' ? `${esc(p.aupair.name)} ↔ ${esc(p.family.name)}` : esc(other.name)}</strong>
    <span class="chip ${status}">${statusLabel(p.status)}</span></div>
    <div class="muted small">${cname(p.country)} · ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)} · ${tr('checklist {done}/{total}', { done: p.tasks_done, total: p.tasks_total })}</div></div></a>`;
}
views.placements = async ([id]) => {
  if (id) return placementDetail(id);
  const { placements } = await api('/placements');
  render(`<h1>${tr('Placements')}</h1><div class="card">${placements.map(placementRow).join('') || `<div class="empty">${tr("No placements yet. Once you match, propose one from the other person's profile.")}</div>`}</div>`);
};

function complianceBox(c) {
  return c.issues.map((i) => `<div class="alert ${i.level}">${i.level === 'error' ? '✖' : i.level === 'warning' ? '⚠' : 'ℹ'} ${esc(i.text)}</div>`).join('')
    + (c.ok ? `<div class="alert ok">✓ ${tr('Meets the program rules on file.')}</div>` : '');
}

views['new-placement'] = async ([otherId]) => {
  const d = await api(`/users/${otherId}`);
  const famProfile = me.user.role === 'family' ? me.profile : d.profile;
  const placeCountry = me.user.role === 'family' ? me.user.country : d.user.country;
  const start = famProfile?.start_date || new Date().toISOString().slice(0, 10);
  const months = famProfile?.duration_months || 12;
  const endD = new Date(start); endD.setMonth(endD.getMonth() + months); endD.setDate(endD.getDate() - 1);
  render(`<h1>${tr('Propose a placement with {name}', { name: esc(d.user.name) })}</h1><div class="cols-2"><form class="card" id="f">
    <p class="muted">${tr('Country: {country}. Both sides confirm before it\'s final.', { country: `<strong>${cname(placeCountry)}</strong>` })}</p>
    <div class="form-grid"><div class="field"><label>${tr('Start date')}</label><input type="date" name="start_date" value="${start}" required></div>
    <div class="field"><label>${tr('End date')}</label><input type="date" name="end_date" value="${endD.toISOString().slice(0, 10)}" required></div>
    <div class="field"><label>${tr('Hours per week')}</label><input type="number" name="weekly_hours" min="1" value="${famProfile?.weekly_hours ?? 30}" required></div>
    <div class="field"><label>${tr('Pocket money per month')}</label><input type="number" name="pocket_money" min="0" value="${famProfile?.pocket_money ?? ''}" required></div></div>
    <div id="err"></div><button class="btn">${tr('Send proposal')}</button></form>
    <div class="card"><h2>${tr('Program check')}</h2><div id="comp" class="muted">${tr('Checking…')}</div></div></div>`);
  const f = document.getElementById('f');
  const body = () => ({ ...formData(f), other_user_id: Number(otherId), weekly_hours: Number(f.weekly_hours.value), pocket_money: Number(f.pocket_money.value) });
  const check = async () => {
    try {
      const c = await api('/compliance/check', { method: 'POST', body: body() });
      document.getElementById('comp').innerHTML = complianceBox(c);
      f.querySelector('button').disabled = !c.ok;
    } catch (e) { document.getElementById('comp').textContent = e.message; }
  };
  f.oninput = () => { clearTimeout(check.t); check.t = setTimeout(check, 300); };
  check();
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/placements', { method: 'POST', body: body() }); toast(tr('Proposal sent')); go(`#/placements/${r.id}`); }
    catch (err) {
      document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
      if (err.data?.compliance) document.getElementById('comp').innerHTML = complianceBox(err.data.compliance);
    }
  };
};

async function placementDetail(id) {
  const p = await api(`/placements/${id}`);
  const isAp = me.user.id === p.aupair_id; const isAdmin = me.user.role === 'admin';
  const other = isAp ? p.family : p.aupair;
  const myConfirmed = isAp ? p.aupair_confirmed : p.family_confirmed;
  const cur = p.program?.currency || '';
  const next = { proposed: [], confirmed: ['active'], active: ['completed'] }[p.status] || [];
  const markAs = { active: tr('Mark as active'), completed: tr('Mark as completed') };
  render(`<div class="spread"><h1>${tr('Placement: {aupair} with {family}', { aupair: esc(p.aupair.name), family: esc(p.family.name) })}</h1><span class="chip ${['confirmed', 'active'].includes(p.status) ? 'ok' : p.status === 'proposed' ? 'warn' : ''}">${statusLabel(p.status)}</span></div>
  <div class="cols-2"><div>
    <div class="card"><table>
      <tr><th>${tr('Country')}</th><td>${cname(p.country)}${p.program ? ` · <a href="#/programs/${p.program.code}">${tr('program guide')}</a>` : ''}</td></tr>
      <tr><th>${tr('Visa route')}</th><td>${esc(p.program?.visa || tr('Check local rules'))}</td></tr>
      <tr><th>${tr('Dates')}</th><td>${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}</td></tr>
      <tr><th>${tr('Hours / week')}</th><td>${p.weekly_hours}</td></tr><tr><th>${tr('Pocket money')}</th><td>${tr('{amount} {currency} / month', { amount: p.pocket_money, currency: cur })}</td></tr>
      <tr><th>${tr('Confirmed by')}</th><td>${p.aupair_confirmed ? '✓' : '○'} ${tr('au pair')} · ${p.family_confirmed ? '✓' : '○'} ${tr('family')}</td></tr></table>
      <div class="row" style="margin-top:12px">
        ${!isAdmin && p.status === 'proposed' && !myConfirmed ? `<button class="btn" id="confirm">${tr('Confirm placement')}</button>` : ''}
        ${!isAdmin ? next.map((s) => `<button class="btn secondary" data-status="${s}">${markAs[s] || s}</button>`).join('') : ''}
        ${['proposed', 'confirmed', 'active'].includes(p.status) ? `<button class="btn ghost" data-status="cancelled">${tr('Cancel')}</button>` : ''}
        ${!isAdmin ? `<a class="btn ghost" href="#/u/${other.id}">${tr('View {name}', { name: esc(other.name) })}</a>` : ''}</div></div>
    <div class="card"><h2>${tr('Program check')}</h2>${complianceBox(p.compliance)}</div>
  </div><div>
    <div class="card"><h2>${tr('Checklist')}</h2><div class="muted small">${tr('{done} of {total} done', { done: p.tasks.filter((t) => t.done).length, total: p.tasks.length })}</div>
      ${p.tasks.map((t) => `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''} ${isAdmin ? 'disabled' : ''}>
        <span class="t" style="flex:1">${esc(tr(t.title))}</span><span class="chip">${t.owner === 'both' ? tr('Both') : t.owner === 'aupair' ? tr('Au pair') : tr('Family')}</span>
        <span class="muted small" style="min-width:90px;text-align:right">${fmtDate(t.due_date)}</span></label>`).join('')}</div>
    ${p.can_review ? `<form class="card" id="review"><h2>${tr('Review {name}', { name: esc(other.name) })}</h2>
      <p class="muted small">${tr('Your review stays hidden until {name} reviews you too, or 14 days after the placement ends.', { name: esc(other.name) })}</p>
      <div class="field"><label>${tr('Overall')}</label>${starInput('overall')}</div>
      <div class="form-grid">${p.review_criteria.map((c) => `<div class="field"><label>${CRIT_LABEL[c] ? tr(CRIT_LABEL[c]) : c}</label>${starInput(c)}</div>`).join('')}</div>
      <div class="field"><label>${tr('Your experience')}</label><textarea name="comment" required placeholder="${tr('What went well? What should others know?')}"></textarea></div>
      <div id="err"></div><button class="btn">${tr('Submit review')}</button></form>`
    : p.my_review ? `<div class="card"><h2>${tr('Your review')}</h2>${stars(p.my_review.overall)}<p style="white-space:pre-wrap">${esc(p.my_review.comment)}</p></div>` : ''}
  </div></div>`);
  const reload = () => placementDetail(id);
  const c = document.getElementById('confirm');
  if (c) c.onclick = async () => { await api(`/placements/${id}/confirm`, { method: 'POST' }); toast(tr('Confirmed')); reload(); };
  document.querySelectorAll('[data-status]').forEach((b) => { b.onclick = async () => {
    if (b.dataset.status === 'cancelled' && !confirm(tr('Cancel this placement?'))) return;
    try { await api(`/placements/${id}/status`, { method: 'POST', body: { status: b.dataset.status } }); reload(); } catch (e) { toast(e.message); }
  }; });
  document.querySelectorAll('[data-task]').forEach((cb) => { cb.onchange = async () => {
    await api(`/placements/${id}/tasks/${cb.dataset.task}`, { method: 'PATCH', body: { done: cb.checked } });
    cb.closest('.task').classList.toggle('done', cb.checked);
  }; });
  bindStarInputs();
  const rf = document.getElementById('review');
  if (rf) rf.onsubmit = async (e) => {
    e.preventDefault();
    const val = (n) => Number(rf.querySelector(`[data-stars="${n}"]`).dataset.value) || undefined;
    try {
      await api(`/placements/${id}/review`, { method: 'POST', body: { overall: val('overall'), comment: rf.comment.value,
        criteria: Object.fromEntries(p.review_criteria.map((k) => [k, val(k)]).filter(([, v]) => v)) } });
      toast(tr('Thanks for your review!')); reload();
    } catch (err) { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
}
const starInput = (name) => `<span class="star-input" data-stars="${name}" data-value="">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${trn(n, '{n} star', '{n} stars')}">★</button>`).join('')}</span>`;
function bindStarInputs() {
  document.querySelectorAll('.star-input').forEach((g) => g.querySelectorAll('button').forEach((b) => { b.onclick = () => {
    g.dataset.value = b.dataset.n;
    g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', Number(x.dataset.n) <= Number(b.dataset.n)));
  }; }));
}

// ---------- programs ----------
const statusChip = (p) => (p.status === 'closed' ? `<span class="chip warn" style="background:var(--err-soft);color:var(--err)">${p.eu_eea_only ? tr('Closed to non-EU') : tr('No au pair route')}</span>`
  : p.status === 'paused' ? `<span class="chip warn">${tr('Visas stalled')}</span>` : `<span class="chip ok">${tr('Open')}</span>`);
views.programs = async ([code]) => {
  const { programs } = await api('/programs');
  PROGRAM_CODES = programs.map((p) => p.code);
  if (code) {
    const p = programs.find((x) => x.code === code.toUpperCase());
    if (!p) return render(`<div class="empty">${tr('No program on file.')}</div>`);
    return render(`<a href="#/programs">← ${tr('All countries')}</a><h1 style="margin-top:8px">${tr('{country} au pair program', { country: cname(p.code) })} ${statusChip(p)}</h1>
      ${p.status_note ? `<div class="alert ${p.status === 'closed' ? 'error' : 'warning'}">${esc(p.status_note)}</div>` : ''}
      <div class="cols-2"><div class="card"><table>
        <tr><th>${tr('Visa / route')}</th><td>${esc(p.visa)}</td></tr><tr><th>${tr('Age')}</th><td>${p.min_age}–${p.max_age}</td></tr>
        <tr><th>${tr('Max hours')}</th><td>${p.max_daily_hours ? tr('{week} per week, {day} per day', { week: p.max_weekly_hours, day: p.max_daily_hours }) : tr('{week} per week', { week: p.max_weekly_hours })}</td></tr>
        <tr><th>${tr('Pocket money')}</th><td>${p.min_pocket_money ? `${tr('From {amount} {currency}/month.', { amount: p.min_pocket_money, currency: p.currency })} ` : ''}${esc(p.pocket_money_note)}</td></tr>
        <tr><th>${tr('Stay length')}</th><td>${tr('{min}–{max} months', { min: p.min_months, max: p.max_months })}</td></tr>
        <tr><th>${tr('Agency required')}</th><td>${p.agency_required ? tr('Yes') : tr('No')}</td></tr>
        ${p.notes ? `<tr><th>${tr('Notes')}</th><td>${esc(p.notes)}</td></tr>` : ''}</table></div>
      <div class="card"><h2>${tr('Host family obligations')}</h2><ul>${p.family_obligations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        <p class="small muted">${tr('Last reviewed {date}. Rules change: always confirm with the {source}.', { date: esc(p.last_reviewed), source: `<a href="${esc(p.official_source)}" target="_blank" rel="noopener">${tr('official source')}</a>` })}</p>
        ${LANG !== 'en' ? `<p class="small muted">${tr('Program details are written in English.')}</p>` : ''}</div></div>`);
  }
  render(`<h1>${tr('Country programs')}</h1><p class="muted">${tr('Indicative rules for the main au pair destinations. The app uses these to check every placement. Always confirm with the official source.')}</p>
    <div class="card table-wrap"><table><tr><th>${tr('Country')}</th><th>${tr('Status')}</th><th>${tr('Age')}</th><th>${tr('Max h/week')}</th><th>${tr('Min pocket money / month')}</th><th>${tr('Stay')}</th><th>${tr('Agency')}</th></tr>
    ${programs.map((p) => `<tr><td><a href="#/programs/${p.code}">${cname(p.code)}</a></td><td>${statusChip(p)}</td><td>${p.min_age}–${p.max_age}</td><td>${p.max_weekly_hours}</td>
      <td>${p.min_pocket_money ? `${p.min_pocket_money} ${p.currency}` : `<span class="muted">${tr('see guide')}</span>`}</td><td>${tr('{min}–{max} mo', { min: p.min_months, max: p.max_months })}</td><td>${p.agency_required ? tr('Required') : '—'}</td></tr>`).join('')}</table></div>`);
};

// ---------- notifications ----------
views.notifications = async () => {
  const { notifications } = await api('/notifications');
  await api('/notifications/read', { method: 'POST' });
  refreshMe();
  render(`<h1>${tr('Notifications')}</h1><div class="card">${notifications.map((n) => `<a href="${esc(n.link || '#/')}" class="spread" style="padding:10px 0;border-top:1px solid var(--line);color:inherit">
    <span>${n.read ? '' : '🔵 '}${esc(n.text)}</span><span class="muted small">${fmtTime(n.created_at)}</span></a>`).join('') || `<div class="empty">${tr("You're all caught up.")}</div>`}</div>`);
};

// ---------- admin ----------
async function adminBackup() {
  const box = document.getElementById('backupInfo'); if (!box) return;
  const show = (b) => {
    const last = b.last ? `Last backup: ${fmtTime(b.last.at)}, ${Math.round(b.last.bytes / 1024)} KB, in <code>${esc(b.bucket)}</code> (keeps ${b.keep_days} days).` : 'No backup since the server started; the first one runs a minute after start-up, then daily.';
    box.className = '';
    box.innerHTML = b.enabled
      ? `<p class="small">${last}</p>${b.last_error ? `<div class="alert error small">Last try failed at ${fmtTime(b.last_error.at)}: ${esc(b.last_error.message)}</div>` : ''}<button class="btn sm" id="backupNow">Back up now</button>`
      : `<div class="alert warning small">${esc(b.problem)}</div>`;
    const btn = document.getElementById('backupNow');
    if (btn) btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Backing up…';
      try { show(await api('/admin/backup', { method: 'POST' })); toast('Backup saved'); }
      catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Back up now'; }
    };
  };
  try { show(await api('/admin/backup')); } catch (e) { box.textContent = e.message; }
}
views.admin = async ([tab = 'overview']) => {
  if (me.user.role !== 'admin') return go('#/');
  const tabs = { overview: 'Overview', users: 'Users & verification', reports: 'Reports', programs: 'Program rules', placements: 'Placements', waitlist: 'Waitlist' };
  const head = `<h1>Program administration</h1><div class="row" style="margin-bottom:16px">${Object.entries(tabs).map(([k, v]) =>
    `<a class="btn ${k === tab ? '' : 'ghost'} sm" href="#/admin/${k}">${v}</a>`).join('')}</div>`;
  if (tab === 'overview') {
    const s = await api('/admin/stats');
    const tiles = [['Au pairs', s.aupairs], ['Host families', s.families], ['Awaiting ID check', s.pending_verification], ['Pending requests', s.open_requests],
      ['Matches', s.matches], ['Active placements', s.placements_active], ['Completed placements', s.placements_completed], ['Reviews', s.reviews], ['Open reports', s.open_reports], ['On the waitlist', s.waitlist]];
    render(`${head}<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${tiles.map(([k, v]) =>
      `<div class="card"><div class="muted small">${k}</div><div style="font-size:1.8rem;font-weight:800">${v}</div></div>`).join('')}</div>
      <div class="card"><h2>Members by country</h2><table><tr><th>Country</th><th>Role</th><th>Members</th></tr>
      ${s.by_country.map((r) => `<tr><td>${cname(r.country) || '—'}</td><td>${r.role === 'aupair' ? 'Au pair' : 'Family'}</td><td>${r.n}</td></tr>`).join('')}</table></div>
      <div class="card" id="backupCard"><h2>Database backups</h2><div id="backupInfo" class="muted">Loading…</div></div>`);
    return adminBackup();
  }
  if (tab === 'users') {
    const { users } = await api('/admin/users');
    render(`${head}<div class="card table-wrap"><table><tr><th>Member</th><th>Role</th><th>Rating</th><th>ID</th><th>References</th><th>Background</th><th>Suspended</th><th>Family Pass</th></tr>
      ${users.map((u) => `<tr><td><a href="#/u/${u.id}">${esc(u.name)}</a><div class="muted small">${esc(u.email)} · ${cname(u.country)}${u.source ? ` · via ${esc(u.source)}` : ''}</div></td>
        <td>${u.role === 'aupair' ? 'Au pair' : 'Family'}</td><td>${u.rating.avg ?? '—'}</td>
        ${['id_verified:id', 'references_checked:references', 'background_checked:background'].map((x) => { const [f, k] = x.split(':');
    return `<td><input type="checkbox" style="width:auto" data-u="${u.id}" data-f="${f}" ${u.verification[k] ? 'checked' : ''}></td>`; }).join('')}
        <td><input type="checkbox" style="width:auto" data-u="${u.id}" data-f="suspended" ${u.suspended ? 'checked' : ''}></td>
        <td>${u.role === 'family' ? `<div class="small">${u.pass_ends_at ? `until ${fmtDate(u.pass_ends_at)}` : '<span class="muted">none</span>'}</div>
          <button class="btn ghost sm" data-free="${u.id}">+ Free days</button>` : ''}</td></tr>`).join('')}</table></div>`);
    document.querySelectorAll('[data-free]').forEach((b) => { b.onclick = async () => {
      const days = Number(prompt('How many free days of the Family Pass?', '30'));
      if (!(days > 0)) return;
      try { await api(`/admin/users/${b.dataset.free}`, { method: 'POST', body: { grant_pass_days: days } }); toast('Free days added'); views.admin(['users']); }
      catch (e) { toast(e.message); }
    }; });
    document.querySelectorAll('[data-u]').forEach((cb) => { cb.onchange = async () => {
      await api(`/admin/users/${cb.dataset.u}`, { method: 'POST', body: { [cb.dataset.f]: cb.checked } }); toast('Saved');
    }; });
    return;
  }
  if (tab === 'reports') {
    const { reports } = await api('/admin/reports');
    render(`${head}<div class="card">${reports.map((r) => `<div style="border-top:1px solid var(--line);padding:12px 0">
      <div class="spread"><strong>${r.review_id ? 'Review' : 'Profile'} report</strong><span class="chip ${r.status === 'open' ? 'warn' : ''}">${r.status}</span></div>
      <div class="small muted">by ${esc(r.reporter_name)} · ${fmtTime(r.created_at)}${r.target_user_id ? ` · about <a href="#/u/${r.target_user_id}">${esc(r.target_name)}</a>` : ''}</div>
      <p style="margin:6px 0">${esc(r.reason)}</p>${r.review_comment ? `<div class="alert info small">Review: “${esc(r.review_comment)}” ${r.review_hidden ? '(hidden)' : ''}</div>` : ''}
      ${r.status === 'open' ? `<div class="row">${r.review_id ? `<button class="btn danger sm" data-rep="${r.id}" data-hide="1">Hide review & resolve</button>` : ''}
        <button class="btn sm" data-rep="${r.id}">Resolve</button><button class="btn ghost sm" data-rep="${r.id}" data-dismiss="1">Dismiss</button></div>` : ''}</div>`).join('')
      || '<div class="empty">No reports. 🎉</div>'}</div>`);
    document.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = async () => {
      await api(`/admin/reports/${b.dataset.rep}`, { method: 'POST', body: { status: b.dataset.dismiss ? 'dismissed' : 'resolved', ...(b.dataset.hide ? { hide_review: true } : {}) } });
      views.admin(['reports']);
    }; });
    return;
  }
  if (tab === 'waitlist') {
    const w = await api('/admin/waitlist');
    const role = (r) => (r === 'aupair' ? 'Au pair' : r === 'family' ? 'Family' : '—');
    return render(`${head}<div class="spread"><p><strong>${w.total}</strong> people want to hear when the apps launch.</p><a class="btn sm" href="/api/admin/waitlist.csv">⬇ Download as a spreadsheet (CSV)</a></div>
      <div class="cols-2"><div class="card"><h2>By role</h2><table>${w.by_role.map((r) => `<tr><td>${role(r.role)}</td><td>${r.n}</td></tr>`).join('')}</table></div>
      <div class="card"><h2>By browser region</h2><table>${w.by_country.map((r) => `<tr><td>${cname(r.country) || '—'}</td><td>${r.n}</td></tr>`).join('')}</table></div>
      <div class="card"><h2>By flyer or ad</h2><table>${w.by_source.map((r) => `<tr><td>${esc(r.source || 'Website')}</td><td>${r.n}</td></tr>`).join('')}</table></div></div>
      <div class="card"><h2>Accounts by flyer or ad</h2><p class="muted small">People who created an account, by the link they came from.</p>
        <table><tr><th>Source</th><th>Families</th><th>Au pairs</th></tr>${(w.signups_by_source || []).map((r) => `<tr><td>${esc(r.source || 'Website')}</td><td>${r.families}</td><td>${r.aupairs}</td></tr>`).join('')}</table></div>
      <div class="card table-wrap"><h2>Latest</h2><table><tr><th>Email</th><th>Role</th><th>Region</th><th>Language</th><th>Source</th><th>Joined</th></tr>
      ${w.people.map((p) => `<tr><td>${esc(p.email)}</td><td>${role(p.role)}</td><td>${cname(p.country) || '—'}</td><td>${esc(LANGUAGES[p.lang] || p.lang)}</td><td>${esc(p.source || '—')}</td><td>${fmtTime(p.created_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nobody yet.</td></tr>'}</table></div>`);
  }
  if (tab === 'placements') {
    const { placements } = await api('/placements');
    return render(`${head}<div class="card">${placements.map(placementRow).join('') || '<div class="empty">No placements yet.</div>'}</div>`);
  }
  if (tab === 'programs') {
    const { programs } = await api('/programs');
    const fields = [['min_age', 'Min age'], ['max_age', 'Max age'], ['max_weekly_hours', 'Max h/week'], ['max_daily_hours', 'Max h/day'],
      ['min_pocket_money', 'Min pocket money'], ['min_months', 'Min months'], ['max_months', 'Max months']];
    render(`${head}<p class="muted">Edit the rules the platform enforces. Changes apply to all new compliance checks immediately.</p>
      ${programs.map((p) => `<form class="card" data-prog="${p.code}"><div class="spread"><h3>${cname(p.code)} <span class="muted small">(${p.currency})</span></h3>
        <span class="muted small">last reviewed ${esc(p.last_reviewed)}</span></div>
        <div class="form-grid">${fields.map(([k, l]) => `<div class="field"><label>${l}</label><input type="number" step="any" name="${k}" value="${p[k] ?? ''}"></div>`).join('')}</div>
        <div class="form-grid"><div class="field"><label>Status</label><select name="status">${options({ open: 'Open', paused: 'Paused (visas stalled)', closed: 'Closed (no route)' }, p.status, null)}</select></div></div>
        <div class="field"><label>Status note</label><input name="status_note" value="${esc(p.status_note)}"></div>
        <div class="field"><label>Visa / route</label><input name="visa" value="${esc(p.visa)}"></div>
        <div class="field"><label>Pocket money note</label><input name="pocket_money_note" value="${esc(p.pocket_money_note)}"></div>
        <label class="check"><input type="checkbox" name="agency_required" ${p.agency_required ? 'checked' : ''}> Agency/sponsor required</label>
        <label class="check"><input type="checkbox" name="eu_eea_only" ${p.eu_eea_only ? 'checked' : ''}> When closed, EU/EEA citizens can still come</label>
        <button class="btn sm" style="margin-top:10px">Save ${esc(p.name)}</button></form>`).join('')}`);
    document.querySelectorAll('[data-prog]').forEach((f) => { f.onsubmit = async (e) => {
      e.preventDefault();
      const v = formData(f);
      const body = { visa: v.visa, pocket_money_note: v.pocket_money_note, agency_required: f.agency_required.checked ? 1 : 0,
        status: v.status, status_note: v.status_note, eu_eea_only: f.eu_eea_only.checked ? 1 : 0 };
      for (const [k] of fields) body[k] = v[k] === '' ? null : Number(v[k]);
      try { await api(`/programs/${f.dataset.prog}`, { method: 'PUT', body }); toast('Program updated'); } catch (err) { toast(err.message); }
    }; });
  }
};

// ---------- Family Pass ----------
views['family-pass'] = async (_args, qs) => {
  const paid = qs.get('paid');
  let pass = await api('/family-pass');
  if (paid) {
    // Back from Stripe: confirm the payment here too, in case its webhook is slow.
    try { const r = await api(`/family-pass/checkout/${encodeURIComponent(paid)}`, { method: 'POST' }); pass = r.pass; if (r.paid) { toast(tr('Thank you! Your Family Pass is active.')); await refreshMe(); } }
    catch (e) { toast(e.message); }
    history.replaceState(null, '', '#/family-pass');
  }
  // Older servers send one pass; newer ones a 1-month and a 3-month plan.
  const plans = pass.plans?.length ? pass.plans : [{ id: 'quarter', days: pass.days, price: pass.price }];
  const planName = (p) => (p.days === 30 ? tr('1 month') : p.days === 90 ? tr('3 months') : tr('{n} days', { n: p.days }));
  const until = pass.active ? `<p><strong>${pass.trial ? tr('Your free trial runs until {date}.', { date: fmtDate(pass.ends_at) }) : tr('Your Family Pass is active until {date}.', { date: fmtDate(pass.ends_at) })}</strong> ${tr('Buying again adds the new days after that.')}</p>` : '';
  render(`<h1>Family Pass</h1><div class="card" style="max-width:560px">
    <p class="muted">${tr("Paid once. It doesn't renew by itself.")}</p>
    <ul><li>${tr('Message every au pair you match with')}</li><li>${tr('See everyone who liked you, and match with one tap')}</li><li>${tr('Au pairs never pay. Swiping and matching are free for everyone.')}</li></ul>
    ${until}
    ${pass.web_checkout ? `<div class="pass-plans">${plans.map((p) => `<button class="pass-plan ${p.days === 90 ? 'best' : ''}" data-plan="${esc(p.id)}">
        ${p.days === 90 && plans.length > 1 ? `<span class="pass-tag">${tr('Best value')}</span>` : ''}<strong>${planName(p)}</strong><span class="pass-price">${esc(p.price)}</span></button>`).join('')}</div>
      <p class="muted small">${tr('You pay securely with Stripe.')}</p>`
      : `<p class="muted">${pass.required ? tr('Payments are coming soon.') : tr('Payments are coming soon. Until then, families can use every feature for free.')}</p>`}
  </div>`);
  document.querySelectorAll('[data-plan]').forEach((b) => { b.onclick = async () => {
    b.disabled = true;
    try { location.href = (await api('/family-pass/checkout', { method: 'POST', body: { plan: b.dataset.plan } })).url; }
    catch (e) { b.disabled = false; if (!needsCode(e)) toast(e.message); }
  }; });
};

// ---------- router ----------
const PUBLIC = new Set(['home', 'login', 'register', 'programs', 'forgot']);
views.messages = ((orig) => (args) => (args[0] ? orig(args) : go('#/matches')))(views.messages);
async function route() {
  clearInterval(pollTimer);
  document.querySelectorAll('.match-overlay').forEach((el) => el.remove());
  const [path, qs] = location.hash.slice(1).split('?');
  const [name = '', ...args] = path.split('/').filter(Boolean);
  const view = views[name || 'home'];
  renderNav();
  if (!view) return render(`<div class="empty">${tr('Page not found.')} <a href="#/">${tr('Go home')}</a></div>`);
  if (!me && !PUBLIC.has(name || 'home')) return go('#/login');
  try { await view(args, new URLSearchParams(qs || '')); }
  catch (e) {
    if (e.status === 401) { me = null; return go('#/login'); }
    render(`<div class="alert error">${esc(e.message)}</div>`);
  }
}
window.addEventListener('hashchange', route);
loadLang().then(() => { renderFooter(); return refreshMe(); }).then(route);
setInterval(() => { if (me) api('/me').then((d) => { me = d; renderNav(); }).catch(() => {}); }, 30000);
