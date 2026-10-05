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
const AGE_GROUPS = { infant: 'Infants (0-2)', toddler: 'Toddlers (2-5)', school: 'School age (5-12)', teen: 'Teens (13+)' };
const SKILLS = { first_aid: 'First aid', swimming: 'Swimming', cooking: 'Cooking', tutoring: 'Homework help', music: 'Music', art: 'Arts & crafts',
  sports: 'Sports', special_needs: 'Special needs care', housekeeping: 'Light housekeeping' };
const CRIT_LABEL = { reliability: 'Reliability', childcare: 'Childcare', communication: 'Communication', household: 'Household help',
  adaptability: 'Adaptability', respect: 'Respect', accommodation: 'Accommodation', fair_hours: 'Fair hours', support: 'Support & inclusion' };

// ---------- utils ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');
const cname = (cc) => (cc ? `${flag(cc)} ${COUNTRIES[cc] || cc}` : '');
const stars = (n) => (n == null ? '<span class="muted small">No reviews yet</span>'
  : `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span> <strong>${n}</strong>`);
const fmtDate = (d) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T') + (d.includes('Z') || d.length === 10 ? '' : 'Z'))
  .toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const fmtTime = (d) => new Date(d.replace(' ', 'T') + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const initials = (name) => esc(String(name || '?').split(/\s+/).filter((w) => !/^(the|family|familie|famille|familia|familien)$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
const avatar = (u, size = '') => (u?.photo_url
  ? `<img class="avatar ${size}" src="${esc(u.photos?.[0] || u.photo_url)}" alt="" onerror="this.outerHTML='<span class=&quot;avatar ${size}&quot;>${initials(u.name)}</span>'">`
  : `<span class="avatar ${size}">${initials(u?.name)}</span>`);
const verifyBadges = (v) => [v?.id && '✔ ID verified', v?.references && '✔ References', v?.background && '✔ Background check']
  .filter(Boolean).map((t) => `<span class="verify">${t}</span>`).join(' ');
const scoreBadge = (s) => `<span class="score ${s >= 75 ? 'high' : s < 50 ? 'low' : ''}" title="Match score">${s}%</span>`;
const options = (obj, selected, blank = '') => (blank !== null ? `<option value="">${blank}</option>` : '')
  + Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
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
  if (!me) { $nav.innerHTML = link('#/programs', 'Country programs') + link('#/login', 'Sign in') + '<a class="btn sm" href="#/register">Join free</a>'; return; }
  const c = me.counts;
  if (me.user.role === 'admin') {
    $nav.innerHTML = [link('#/admin', 'Admin'), link('#/placements', 'Placements'), link('#/programs', 'Programs'), link('#/notifications', '🔔', c.notifications), '<a href="#/logout">Sign out</a>'].join('');
    return;
  }
  $nav.innerHTML = [
    link('#/discover', 'Discover', 0, '🔥'),
    link('#/likes', 'Likes', c.requests, '💛'),
    link('#/matches', 'Matches', c.messages, '💬'),
    link('#/placements', 'Placements', 0, '🧳'),
    link('#/profile', 'Profile', 0, '👤'),
    `<a href="#/notifications" class="nav-bell ${route === 'notifications' ? 'active' : ''}">🔔${c.notifications ? `<span class="badge">${c.notifications}</span>` : ''}</a>`,
    '<a href="#/logout" class="nav-signout">Sign out</a>',
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
  const kids = p.children?.length ? `${p.children.length} ${p.children.length === 1 ? 'child' : 'kids'} (${p.children.map((c) => c.age).join(', ')})` : '';
  const langs = u.role === 'aupair' ? (p.languages || []).map((l) => LANGS[l.code] || l.code) : (p.languages || []).map((l) => LANGS[l] || l);
  return `<div class="card-info">
    <h2>${esc(u.name)}${ageOf(r) ? ` <span class="age">${ageOf(r)}</span>` : ''} ${u.verification?.id ? '<span class="tick" title="ID verified">✔</span>' : ''}</h2>
    <div class="sub">${flag(u.country)} ${esc([u.city, COUNTRIES[u.country]].filter(Boolean).join(', '))}${u.role === 'aupair' && p.nationality && p.nationality !== u.country ? ` · ${flag(p.nationality)} ${esc(COUNTRIES[p.nationality] || '')}` : ''}</div>
    <div class="sub">${u.role === 'aupair' ? [p.childcare_years ? `${p.childcare_years} yrs childcare` : '', p.available_from ? `from ${fmtDate(p.available_from)}` : ''].filter(Boolean).join(' · ') : [kids, p.start_date ? `starts ${fmtDate(p.start_date)}` : ''].filter(Boolean).join(' · ')}</div>
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
    ${!me.user.email_verified ? '<a class="alert warning nudge" href="#/verify">📧 Confirm your email to start liking. Click to enter your code.</a>' : ''}
    ${!(me.user.photos?.length) ? `<a class="alert warning nudge" href="#/profile">📸 Add a photo so ${isFamily ? 'au pairs' : 'families'} can see you. Profiles with photos get far more matches.</a>`
    : completeness < 70 ? `<a class="alert info nudge" href="#/profile">Your profile is ${completeness}% complete. Finish it to improve your matches →</a>` : ''}
    <div class="disc-head"><button class="btn ghost sm" id="toggleFilters">⚙ Filters${nFilters ? ` (${nFilters})` : ''}</button>
      <a class="btn ghost sm" href="#/search${deckQuery ? `?${deckQuery}` : ''}">☰ List view</a></div>
    <form class="card filters" id="filters" hidden>
      <div class="form-grid">
      <div class="field"><label>${isFamily ? 'Lives in' : 'Family country'}</label><select name="country">${options(COUNTRIES, q.country, 'Anywhere')}</select></div>
      ${isFamily ? `<div class="field"><label>Nationality</label><select name="nationality">${options(COUNTRIES, q.nationality, 'Any')}</select></div>` : ''}
      <div class="field"><label>Language</label><select name="language">${options(LANGS, q.language, 'Any')}</select></div>
      ${isFamily ? `<div class="field"><label>Age</label><div class="row" style="flex-wrap:nowrap"><input type="number" name="min_age" min="17" max="35" placeholder="min" value="${esc(q.min_age)}"><input type="number" name="max_age" min="17" max="35" placeholder="max" value="${esc(q.max_age)}"></div></div>
      <div class="field"><label>Available by</label><input type="date" name="available_by" value="${esc(q.available_by)}"></div>` : ''}
      </div>
      <div class="row">${isFamily ? `<label class="check"><input type="checkbox" name="driver" value="1" ${q.driver ? 'checked' : ''}> Driver</label>` : ''}
        <label class="check"><input type="checkbox" name="verified" value="1" ${q.verified ? 'checked' : ''}> ID verified only</label>
        <span style="flex:1"></span><a class="btn ghost sm" href="#/discover">Clear</a><button class="btn sm">Apply</button></div>
    </form>
    <div class="deck" id="deck"><div class="deck-empty">Finding people for you…</div></div>
    <div class="deck-actions" id="deckActions">
      <button class="round sm undo" id="undo" title="Undo last swipe">↺</button>
      <button class="round lg nope" id="nope" title="Pass (←)">✕</button>
      <button class="round sm super" id="super" title="Super like (↑)">★</button>
      <button class="round lg like" id="like" title="Like (→)">♥</button>
      <button class="round sm info" id="info" title="Full profile">ⓘ</button>
    </div>
    <p class="muted small center hint">Drag the card, or use ← → ↑ on your keyboard.</p></div>`);
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
    $deck.innerHTML = `<div class="deck-empty"><div style="font-size:3rem">🌍</div><h2>You've seen everyone for now</h2>
      <p class="muted">New ${me.user.role === 'family' ? 'au pairs' : 'families'} join every day. Try wider filters, or take another look at people you passed.</p>
      <div class="row" style="justify-content:center"><button class="btn secondary" id="resetPasses">Show passed profiles again</button><a class="btn ghost" href="#/discover">Clear filters</a></div></div>`;
    document.getElementById('resetPasses').onclick = async () => { await api('/swipes/passes', { method: 'DELETE' }); loadDeck(); };
    return;
  }
  $deck.innerHTML = deck.slice(0, 3).map((r, i) => `<div class="swipe-card" data-i="${i}" style="z-index:${10 - i};transform:scale(${1 - i * 0.04}) translateY(${i * 14}px)">
      ${gallery(r.user, { cls: 'card-gallery' })}
      <div class="stamp like">LIKE</div><div class="stamp nope">NOPE</div><div class="stamp super">SUPER</div>
      ${r.match ? `<div class="card-score ${r.match.score >= 75 ? 'high' : ''}">${r.match.score}% match</div>` : ''}
      ${r.likes_you ? '<div class="likes-you">💛 Likes you</div>' : ''}
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
  try { const { user } = await api('/swipe/undo', { method: 'POST' }); await loadDeck(user.id); toast(`Brought back ${user.name}`); }
  catch (e) { toast(e.message); }
}

function showMatch(other, convId) {
  const el = document.createElement('div');
  el.className = 'match-overlay';
  el.innerHTML = `<div class="match-box"><div class="match-title">It's a match!</div>
    <p>You and ${esc(other.name)} liked each other.</p>
    <div class="match-photos">${photoOrPlaceholder(me.user, 'match-photo')}${photoOrPlaceholder(other, 'match-photo')}</div>
    <a class="btn" href="#/messages/${convId}">💬 Send a message</a>
    <button class="btn ghost" id="keep">Keep swiping</button></div>`;
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
  ${r.super ? '<span class="tile-super">★ Super like</span>' : ''}${r.match ? `<span class="tile-score">${r.match.score}%</span>` : ''}
  <div class="tile-info"><strong>${esc(r.user.name)}${ageOf(r) ? `, ${ageOf(r)}` : ''}</strong><span>${flag(r.user.country)} ${esc(COUNTRIES[r.user.country] || '')}</span>${extra}</div></a>`;

views.likes = async () => {
  const { likes } = await api('/likes');
  render(`<h1>${likes.length} ${likes.length === 1 ? 'person likes' : 'people like'} you</h1>
    <p class="muted">Like them back to match and start chatting.</p>
    <div class="tiles">${likes.map((l) => tile(l, l.message ? `<em>“${esc(l.message.slice(0, 60))}${l.message.length > 60 ? '…' : ''}”</em>` : '')).join('')
    || '<div class="empty" style="grid-column:1/-1">No new likes yet. Keep your profile fresh and keep swiping!<br><br><a class="btn" href="#/discover">Discover</a></div>'}</div>`);
};

// ---------- matches ----------
views.matches = async () => {
  const { conversations } = await api('/conversations');
  const fresh = conversations.filter((c) => !c.last_body);
  render(`<h1>Matches</h1>
    <div class="match-row">${conversations.map((c) => `<a href="#/messages/${c.id}" class="match-bubble">${photoOrPlaceholder(c.other, 'bubble-img')}
      ${c.unread ? '<span class="dot"></span>' : ''}<span>${esc(c.other.name.split(' ')[0] === 'The' ? c.other.name.split(' ')[1] : c.other.name.split(' ')[0])}</span></a>`).join('')
      || '<div class="muted">No matches yet. <a href="#/discover">Start swiping</a>.</div>'}</div>
    <h2 style="margin-top:20px">Messages</h2>
    <div class="card" style="padding:0">${conversations.filter((c) => c.last_body).map((c) => `<a href="#/messages/${c.id}" class="convo">
      ${photoOrPlaceholder(c.other, 'avatar')}<div style="flex:1;min-width:0"><div class="spread"><strong>${esc(c.other.name)}</strong><span class="muted small">${c.last_at ? fmtTime(c.last_at) : ''}</span></div>
      <div class="${c.unread ? '' : 'muted'} small ellipsis">${c.unread ? '<strong>' : ''}${esc(c.last_body)}${c.unread ? '</strong>' : ''}</div></div>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</a>`).join('')
      || `<div class="empty">${fresh.length ? 'Say hi to your new matches above!' : 'Your conversations will show up here.'}</div>`}</div>`);
};


function profileCompleteness() {
  const p = me.profile || {}; const u = me.user;
  const checks = u.role === 'aupair'
    ? [u.country, u.photos?.length, p.birth_date, p.nationality, p.languages?.length, p.preferred_countries?.length, p.age_groups?.length, p.available_from, p.duration_months, p.bio]
      : [u.country, u.city, u.photos?.length, p.children?.length, p.languages?.length, p.start_date, p.duration_months, p.weekly_hours, p.pocket_money, p.bio];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function landing() {
  render(`
    <section class="hero">
      <h1>Swipe. Match. Welcome your au pair.</h1>
      <p>Photo-first profiles from families and au pairs worldwide. Swipe right on the ones you like; when it's mutual, you're matched and can chat. Program rules, verification and two-way reviews are built in.</p>
      <div class="row" style="justify-content:center"><a class="btn" href="#/register?role=family">I'm a host family</a>
      <a class="btn secondary" href="#/register?role=aupair">I want to be an au pair</a></div>
    </section>
    <div class="grid">
      ${[['🔥', 'Swipe to match', 'Swipe right to like, left to pass, up to super like. When you both like each other it\'s a match.'],
    ['🎯', 'Smart matching', 'A match score that weighs languages, dates, childcare experience, destination wishes and program eligibility, with the reasons shown.'],
    ['⭐', 'Two-way reviews', 'Families and au pairs rate each other after a real placement. Reviews stay hidden until both sides submit, so they are honest.'],
    ['🛂', 'Program rules built in', 'Age limits, maximum hours and minimum pocket money for each country are checked before a placement can be agreed.'],
    ['💬', 'Safe messaging', 'Chat opens only when you match, so nobody can message you out of the blue. Report anything suspicious in one click.'],
    ['✅', 'Placement checklist', 'Contract, visa, insurance, travel, language course and check-ins tracked for both sides.'],
    ['🛡️', 'Verified profiles', 'Program staff verify ID, references and background checks, and the badges show on every profile.']]
    .map(([i, t, d]) => `<div class="card feature"><div class="icon">${i}</div><h3>${t}</h3><p class="muted">${d}</p></div>`).join('')}
    </div>`);
}

views.login = () => {
  render(`<div class="card" style="max-width:420px;margin:32px auto"><h1>Sign in</h1>
    <form id="f"><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label>Password</label><input name="password" type="password" required autocomplete="current-password"></div>
    <div id="err"></div><button class="btn" style="width:100%">Sign in</button></form>
    <p class="small"><a href="#/forgot">Forgot password?</a></p>
    <p class="muted small">New here? <a href="#/register">Create an account</a>.<br>Demo: maria@aupair.test, millers@aupair.test or admin@aupair.test, password <code>password123</code>.</p></div>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/login', { method: 'POST', body: formData(e.target) }); await refreshMe(); go('#/'); }
    catch (err) { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
};

views.register = (_, query) => {
  const role = query.get('role') || 'family';
  render(`<div class="card" style="max-width:480px;margin:32px auto"><h1>Create your account</h1>
    <form id="f">
      <div class="field"><label>I am</label><select name="role">
        <option value="family" ${role === 'family' ? 'selected' : ''}>A host family</option>
        <option value="aupair" ${role === 'aupair' ? 'selected' : ''}>An au pair</option></select></div>
      <div class="field"><label>Name</label><input name="name" required placeholder="e.g. Maria Lopez or The Smith Family"></div>
      <div class="form-grid"><div class="field"><label>Country you live in</label><select name="country" required>${options(COUNTRIES, '', 'Choose…')}</select></div>
      <div class="field"><label>City</label><input name="city"></div></div>
      <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label>Password</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <div id="err"></div><button class="btn" style="width:100%">Create account</button></form></div>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/register', { method: 'POST', body: formData(e.target) }); await refreshMe(); toast('Welcome! Check your email for your code.'); go('#/verify'); }
    catch (err) { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
};

const errBox = (err) => { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; };

views.forgot = () => {
  render(`<div class="card" style="max-width:420px;margin:32px auto"><h1>Forgot password</h1>
    <form id="f1"><p class="muted">Enter the email you signed up with. We'll send you a 6-digit code to set a new password.</p>
      <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
      <button class="btn" style="width:100%">Send code</button></form>
    <form id="f2" hidden><div class="alert ok" id="sentNote"></div>
      <div class="field"><label>6-digit code</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required></div>
      <div class="field"><label>New password</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      <button class="btn" style="width:100%">Set new password</button></form>
    <div id="err"></div></div>`);
  let email = '';
  document.getElementById('f1').onsubmit = async (e) => {
    e.preventDefault(); email = e.target.email.value.trim();
    try {
      await api('/auth/forgot', { method: 'POST', body: { email } });
      e.target.hidden = true; document.getElementById('f2').hidden = false;
      document.getElementById('sentNote').textContent = `If ${email} has an account, a code is on its way. Check your inbox and spam folder.`;
    } catch (err) { errBox(err); }
  };
  document.getElementById('f2').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/reset', { method: 'POST', body: { email, ...formData(e.target) } }); await refreshMe(); toast('Password changed'); go('#/'); }
    catch (err) { errBox(err); }
  };
};

views.verify = async () => {
  await refreshMe();
  if (me.user.email_verified) { render('<div class="card" style="max-width:420px;margin:32px auto"><div class="alert ok">Your email is confirmed.</div><a class="btn" href="#/">Continue</a></div>'); return; }
  render(`<div class="card" style="max-width:420px;margin:32px auto"><h1>Confirm your email</h1>
    <p>We sent a 6-digit code to <strong>${esc(me.user.email)}</strong>. Enter it so you can like people and send messages.</p>
    <form id="f"><div class="field"><label>6-digit code</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required></div>
    <div id="err"></div><button class="btn" style="width:100%">Confirm</button></form>
    <p class="small"><button class="btn ghost sm" id="resend">Send a new code</button> <span class="muted">Can't find it? Check your spam folder.</span></p></div>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/verify-email', { method: 'POST', body: formData(e.target) }); await refreshMe(); toast('Email confirmed'); go('#/'); }
    catch (err) { errBox(err); }
  };
  document.getElementById('resend').onclick = async () => { await api('/auth/resend-verification', { method: 'POST' }); toast('A new code is on its way'); };
};

views.account = async () => {
  await refreshMe();
  const { blocked } = await api('/blocks');
  render(`<h1>Account and safety</h1>
    <div class="card"><h2>Email</h2><p>${esc(me.user.email)} ${me.user.email_verified ? '<span class="chip ok">✓ Confirmed</span>' : '<a class="chip warn" href="#/verify">Not confirmed: enter your code</a>'}</p></div>
    <div class="card"><h2>Blocked people</h2>${blocked.length ? blocked.map((u) => `<div class="row" style="padding:6px 0">${avatar(u, 'sm')}<strong style="flex:1">${esc(u.name)}</strong>
      <button class="btn ghost sm" data-unblock="${u.id}">Unblock</button></div>`).join('') : '<p class="muted">You haven\'t blocked anyone.</p>'}</div>
    <div class="card"><h2>Delete account</h2><p class="muted small">This permanently deletes your profile, photos, matches, messages, placements and reviews.</p>
      <form id="del"><div class="field"><label>Your password</label><input name="password" type="password" required autocomplete="current-password"></div>
      <div id="err"></div><button class="btn danger">Delete my account</button></form></div>`);
  document.querySelectorAll('[data-unblock]').forEach((b) => { b.onclick = async () => {
    if (!confirm('Unblock this person? You will be able to see each other again.')) return;
    await api(`/users/${b.dataset.unblock}/block`, { method: 'DELETE' }); views.account();
  }; });
  document.getElementById('del').onsubmit = async (e) => {
    e.preventDefault();
    if (!confirm('Delete your account? This cannot be undone.')) return;
    try { await api('/me', { method: 'DELETE', body: formData(e.target) }); me = null; toast('Your account was deleted'); go('#/'); }
    catch (err) { errBox(err); }
  };
};

/** Liking and messaging need a confirmed email; send people to enter their code. */
const needsCode = (e) => { if (e.data?.code !== 'email_unverified') return false; toast(e.message); go('#/verify'); return true; };

const blockUser = async (u, reason) => {
  if (!confirm(`Block ${u.name}? You won't see each other anywhere, and your chat closes. They aren't told.`)) return false;
  await api(`/users/${u.id}/block`, { method: 'POST', body: reason ? { reason } : {} });
  await refreshMe(); toast(`${u.name} is blocked`);
  return true;
};

views.logout = async () => { await api('/auth/logout', { method: 'POST' }); me = null; renderNav(); go('#/'); };

// ---------- search ----------
function resultCard(r) {
  const u = r.user; const p = r.profile || {};
  const sub = u.role === 'aupair'
    ? [p.age && `${p.age} yrs`, p.nationality && cname(p.nationality), p.childcare_years && `${p.childcare_years} yrs childcare`].filter(Boolean).join(' · ')
    : [cname(u.country), u.city, p.children?.length && `${p.children.length} ${p.children.length === 1 ? 'child' : 'children'} (${p.children.map((c) => c.age).join(', ')})`].filter(Boolean).join(' · ');
  const langs = u.role === 'aupair' ? (p.languages || []).map((l) => LANGS[l.code] || l.code) : (p.languages || []).map((l) => LANGS[l] || l);
  return `<a class="card" href="#/u/${u.id}" style="display:block;color:inherit;text-decoration:none">
    <div class="row" style="align-items:flex-start">${avatar(u)}<div style="flex:1;min-width:0">
      <div class="spread"><strong>${esc(u.name)}</strong>${r.match ? scoreBadge(r.match.score) : ''}</div>
      <div class="muted small">${sub}</div><div class="small">${stars(r.rating?.avg)} ${r.rating?.count ? `<span class="muted">(${r.rating.count})</span>` : ''}</div></div></div>
    <div class="chips" style="margin-top:10px">${langs.slice(0, 4).map((l) => `<span class="chip">${esc(l)}</span>`).join('')}
      ${u.role === 'aupair' && p.drivers_license ? '<span class="chip">🚗 Driver</span>' : ''}
      ${u.role === 'aupair' && p.available_from ? `<span class="chip">From ${fmtDate(p.available_from)}</span>` : ''}
      ${u.role === 'family' && p.start_date ? `<span class="chip">Starts ${fmtDate(p.start_date)}</span>` : ''}</div>
    ${r.match?.reasons?.length ? `<div class="small" style="margin-top:8px;color:var(--ok)">✓ ${esc(r.match.reasons.slice(0, 2).join(' · '))}</div>` : ''}
    ${r.match?.warnings?.length ? `<div class="small" style="color:var(--warn)">⚠ ${esc(r.match.warnings[0])}</div>` : ''}
    <div class="small" style="margin-top:6px">${verifyBadges(u.verification)}</div></a>`;
}

views.search = async (_, query) => {
  const isFamily = me.user.role === 'family';
  const q = Object.fromEntries(query.entries());
  render(`<h1>${isFamily ? 'Find your au pair' : 'Find your host family'}</h1>
    <div class="cols"><form class="card" id="filters">
      <div class="field"><label>Keyword</label><input name="q" value="${esc(q.q)}" placeholder="name, city, interests"></div>
      <div class="field"><label>${isFamily ? 'Lives in' : 'Family country'}</label><select name="country">${options(COUNTRIES, q.country, 'Anywhere')}</select></div>
      ${isFamily ? `<div class="field"><label>Nationality</label><select name="nationality">${options(COUNTRIES, q.nationality, 'Any')}</select></div>` : ''}
      <div class="field"><label>Language</label><select name="language">${options(LANGS, q.language, 'Any')}</select></div>
      ${isFamily ? `<div class="form-grid" style="grid-template-columns:1fr 1fr"><div class="field"><label>Min age</label><input type="number" name="min_age" min="17" max="35" value="${esc(q.min_age)}"></div>
        <div class="field"><label>Max age</label><input type="number" name="max_age" min="17" max="35" value="${esc(q.max_age)}"></div></div>
        <div class="field"><label>Available by</label><input type="date" name="available_by" value="${esc(q.available_by)}"></div>
        <div class="field"><label class="check"><input type="checkbox" name="driver" value="1" ${q.driver ? 'checked' : ''}> Has driver's license</label></div>` : ''}
      <div class="field"><label>Minimum rating</label><select name="min_rating">${options({ 3: '3★ and up', 4: '4★ and up', 4.5: '4.5★ and up' }, q.min_rating, 'Any')}</select></div>
      <div class="field"><label class="check"><input type="checkbox" name="verified" value="1" ${q.verified ? 'checked' : ''}> ID verified only</label></div>
      <div class="field"><label>Sort by</label><select name="sort">${options({ match: 'Best match', rating: 'Highest rated', recent: 'Recently active' }, q.sort || 'match', null)}</select></div>
      <button class="btn" style="width:100%">Search</button></form>
    <div id="results"><div class="empty">Searching…</div></div></div>`);
  document.getElementById('filters').onsubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(Object.entries(formData(e.target)).filter(([, v]) => v));
    go(`#/search?${params}`);
  };
  const { total, results } = await api(`/search?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`);
  document.getElementById('results').innerHTML = `<p class="muted">${total} ${total === 1 ? 'result' : 'results'}</p>
    <div class="grid">${results.map(resultCard).join('') || '<div class="empty">No one matches these filters yet. Try widening them.</div>'}</div>`;
};

// ---------- public profile ----------
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
  if (d.blocked) action = '<div class="alert warning">You blocked this person. They can\'t see you or message you. <button class="btn secondary sm" id="unblock">Unblock</button></div>';
  else if (canAct) {
    if (matched) action = '<div class="row center-row"><button class="btn" id="msg">💬 Message</button><button class="btn secondary" id="place">🧳 Propose placement</button></div>';
    else if (iLiked) action = '<div class="liked-note">♥ You liked them. You\'ll match if they like you back.</div>';
    else action = `${likesMe ? '<div class="liked-note">💛 They like you! Like them back to match.</div>' : ''}
      <div class="deck-actions"><button class="round lg nope" data-swipe="pass" title="Pass">✕</button>
      <button class="round sm super" data-swipe="super" title="Super like">★</button><button class="round lg like" data-swipe="like" title="Like">♥</button></div>`;
  }
  const facts = u.role === 'aupair' ? [
    ['🎂', 'Age', p.age], ['🛂', 'Nationality', cname(p.nationality)], ['🧸', 'Childcare experience', p.childcare_years != null && `${p.childcare_years} years`],
    ['📅', 'Available from', fmtDate(p.available_from)], ['⏳', 'Stay length', p.duration_months && `${p.duration_months} months`],
    ['🚗', 'Driver\'s license', p.drivers_license ? 'Yes' : 'No'], ['🚭', 'Non-smoker', p.non_smoker ? 'Yes' : 'No'], ['🐾', 'OK with pets', p.ok_with_pets ? 'Yes' : 'No'],
    ['🎓', 'Education', p.education],
  ] : [
    ['📍', 'Location', [u.city, cname(u.country)].filter(Boolean).join(', ')], ['👶', 'Children', p.children?.length ? p.children.map((c) => `${c.age} yrs`).join(', ') : '—'],
    ['📅', 'Start date', fmtDate(p.start_date)], ['⏳', 'Stay length', p.duration_months && `${p.duration_months} months`], ['⏰', 'Hours / week', p.weekly_hours],
    ['💶', 'Pocket money / month', p.pocket_money], ['🚗', 'Needs a driver', p.needs_driver ? 'Yes' : 'No'], ['🐾', 'Pets', p.has_pets ? 'Yes' : 'No'], ['🛏️', 'Private room', p.private_room ? 'Yes' : 'No'],
  ];
  render(`<div class="profile-layout"><div class="profile-left">
      <div class="profile-hero">${gallery(u, { cls: 'hero-gallery' })}<div class="card-shade"></div>
        ${d.match ? `<div class="card-score ${d.match.score >= 75 ? 'high' : ''}">${d.match.score}% match</div>` : ''}
        <div class="card-info static"><h2>${esc(u.name)}${p.age && u.role === 'aupair' ? ` <span class="age">${p.age}</span>` : ''} ${u.verification.id ? '<span class="tick" title="ID verified">✔</span>' : ''}</h2>
          <div class="sub">${u.role === 'aupair' ? 'Au pair' : 'Host family'} · ${flag(u.country)} ${esc([u.city, COUNTRIES[u.country]].filter(Boolean).join(', '))}</div>
          <div class="sub">${d.rating.count ? `★ ${d.rating.avg} (${d.rating.count} reviews) · ` : ''}${d.placements_completed} completed placements</div></div></div>
      ${action}
      <div class="row center-row small">${!mine ? `<button class="btn ghost sm" id="fav">${d.favorite ? '♥ Saved' : '♡ Save'}</button><button class="btn ghost sm" id="report">⚑ Report</button>${d.blocked ? '' : '<button class="btn ghost sm" id="block">🚫 Block</button>'}` : '<a class="btn secondary" href="#/profile">Edit profile</a>'}
        <button class="btn ghost sm" onclick="history.back()">← Back</button></div>
    </div><div class="profile-right">
      ${d.match ? `<div class="card"><h3>Why you match</h3>
        ${d.match.reasons.map((r) => `<div class="small" style="color:var(--ok)">✓ ${esc(r)}</div>`).join('')}
        ${d.match.warnings.map((r) => `<div class="small" style="color:var(--warn)">⚠ ${esc(r)}</div>`).join('')}</div>` : ''}
      <div class="card"><h3>${u.role === 'aupair' ? 'About me' : 'About us'}</h3><p style="white-space:pre-wrap;margin-top:0">${esc(p.bio) || '<span class="muted">No description yet.</span>'}</p>
        <div>${verifyBadges(u.verification) || '<span class="muted small">Not yet verified</span>'}</div></div>
      <div class="card"><h3>Basics</h3><div class="facts">${facts.filter(([, , v]) => v != null && v !== '').map(([i, k, v]) => `<div class="fact"><span>${i}</span><div><div class="muted small">${k}</div>${esc(v)}</div></div>`).join('')}</div></div>
      <div class="card">${u.role === 'aupair' ? `<h3>Languages</h3><div class="chips">${(p.languages || []).map((l) => `<span class="chip">${esc(LANGS[l.code] || l.code)} · ${esc(l.level)}</span>`).join('')}</div>
          <h3 style="margin-top:12px">Experience with</h3><div class="chips">${(p.age_groups || []).map((g) => `<span class="chip">${AGE_GROUPS[g] || esc(g)}</span>`).join('')}</div>
          <h3 style="margin-top:12px">Skills</h3><div class="chips">${(p.skills || []).map((x) => `<span class="chip">${SKILLS[x] || esc(x)}</span>`).join('')}</div>
          <h3 style="margin-top:12px">Wants to go to</h3><div class="chips">${(p.preferred_countries || []).map((c) => `<span class="chip">${cname(c)}</span>`).join('') || '<span class="muted">Open to anywhere</span>'}</div>`
    : `<h3>Languages at home</h3><div class="chips">${(p.languages || []).map((l) => `<span class="chip">${esc(LANGS[l] || l)}</span>`).join('')}</div>
          <h3 style="margin-top:12px">Au pair must speak</h3><div class="chips">${(p.required_languages || []).map((l) => `<span class="chip">${esc(LANGS[l] || l)}</span>`).join('') || '<span class="muted">No requirement</span>'}</div>`}</div>
      <div class="card"><h3>Reviews</h3>${ratingBreakdown(d.rating)}
        ${d.reviews.map((r) => reviewItem(r, mine)).join('') || '<div class="empty">No reviews yet. Reviews come only from real placements.</div>'}</div>
    </div></div>`);

  const on = (sel, fn) => { const el = document.getElementById(sel); if (el) el.onclick = fn; };
  document.querySelectorAll('[data-swipe]').forEach((b) => { b.onclick = async () => {
    try {
      const res = await api('/swipe', { method: 'POST', body: { target_id: u.id, direction: b.dataset.swipe } });
      await refreshMe();
      if (res.matched) { showMatch(u, res.conversation_id); views.u([id]); }
      else if (b.dataset.swipe === 'pass') { toast('Passed'); history.back(); }
      else { toast(b.dataset.swipe === 'super' ? '★ Super like sent' : '♥ Liked'); views.u([id]); }
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
    const reason = prompt('What is wrong with this profile? Our team reviews every report.');
    if (reason) { await api('/reports', { method: 'POST', body: { target_user_id: u.id, reason } }); toast('Thanks, our team will look into it.'); }
  });
  bindReviewActions(() => views.u([id]));
};

function ratingBreakdown(r) {
  if (!r.count) return '';
  return `<div class="form-grid" style="margin-bottom:12px">${Object.entries(r.criteria).map(([k, v]) => `<div class="small">
    <div class="spread"><span>${CRIT_LABEL[k] || k}</span><strong>${v}</strong></div><div class="bar"><span style="width:${v * 20}%"></span></div></div>`).join('')}</div>`;
}
function reviewItem(r, canRespond) {
  return `<div style="border-top:1px solid var(--line);padding:12px 0">
    <div class="spread"><div>${stars(r.overall)} <span class="muted small">by <a href="#/u/${r.reviewer_id}">${esc(r.reviewer_name)}</a> · ${cname(r.country)} · ${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}</span></div>
      <button class="btn ghost sm" data-report-review="${r.id}">Report</button></div>
    <p style="white-space:pre-wrap;margin:6px 0">${esc(r.comment)}</p>
    ${r.response ? `<div class="alert info small"><strong>Response:</strong> ${esc(r.response)}</div>`
    : canRespond ? `<button class="btn ghost sm" data-respond="${r.id}">Respond publicly</button>` : ''}</div>`;
}
function bindReviewActions(reload) {
  document.querySelectorAll('[data-report-review]').forEach((b) => { b.onclick = async () => {
    const reason = prompt('Why should this review be checked?');
    if (reason) { await api('/reports', { method: 'POST', body: { review_id: Number(b.dataset.reportReview), reason } }); toast('Reported to moderators.'); }
  }; });
  document.querySelectorAll('[data-respond]').forEach((b) => { b.onclick = async () => {
    const response = prompt('Your public response:');
    if (response) { try { await api(`/reviews/${b.dataset.respond}/response`, { method: 'POST', body: { response } }); reload(); } catch (e) { toast(e.message); } }
  }; });
}

// ---------- my profile ----------
views.profile = async () => {
  await refreshMe();
  const u = me.user; const p = me.profile || {};
  const isAp = u.role === 'aupair';
  const chipSet = (name, dict, selected) => `<div class="chips" data-chipset="${name}">${Object.entries(dict).map(([k, v]) =>
    `<button type="button" class="chip chip-toggle ${(selected || []).includes(k) ? 'on' : ''}" data-v="${k}">${esc(v)}</button>`).join('')}</div>`;
  render(`<div class="spread"><h1>My profile</h1><span><a href="#/account">🔒 Account and safety</a> · <a href="#/u/${u.id}">See how others see you →</a></span></div>
  <div class="card"><h2>Photos</h2><p class="muted small">Your first photo is what people see when they swipe. Add up to 6; clear, smiling, recent photos work best${isAp ? ', and one with kids (with permission) helps' : ', and a family photo plus your home helps'}.</p>
    <div class="photo-grid" id="photoGrid"></div></div>
  <form id="f"><div class="card"><h2>Basics</h2><div class="form-grid">
      <div class="field"><label>Name</label><input name="name" value="${esc(u.name)}" required></div>
      <div class="field"><label>Country</label><select name="country">${options(COUNTRIES, u.country, 'Choose…')}</select></div>
      <div class="field"><label>City</label><input name="city" value="${esc(u.city)}"></div>
</div>
      <div class="field"><label>${isAp ? 'About me' : 'About our family'}</label><textarea name="bio" maxlength="5000">${esc(p.bio)}</textarea></div>
      <label class="check"><input type="checkbox" name="visible" ${p.visible !== 0 ? 'checked' : ''}> Show my profile in search</label></div>
  ${isAp ? `<div class="card"><h2>Au pair details</h2><div class="form-grid">
      <div class="field"><label>Date of birth</label><input type="date" name="birth_date" value="${esc(p.birth_date)}"></div>
      <div class="field"><label>Nationality</label><select name="nationality">${options(COUNTRIES, p.nationality, 'Choose…')}</select></div>
      <div class="field"><label>Years of childcare experience</label><input type="number" step="0.5" min="0" name="childcare_years" value="${esc(p.childcare_years)}"></div>
      <div class="field"><label>Available from</label><input type="date" name="available_from" value="${esc(p.available_from)}"></div>
      <div class="field"><label>Stay length (months)</label><input type="number" min="1" max="24" name="duration_months" value="${esc(p.duration_months)}"></div>
      <div class="field"><label>Education</label><input name="education" value="${esc(p.education)}"></div>
      <div class="field"><label>Intro video URL</label><input name="video_url" value="${esc(p.video_url)}"></div></div>
      <div class="row"><label class="check"><input type="checkbox" name="drivers_license" ${p.drivers_license ? 'checked' : ''}> Driver's license</label>
        <label class="check"><input type="checkbox" name="non_smoker" ${p.non_smoker !== 0 ? 'checked' : ''}> Non-smoker</label>
        <label class="check"><input type="checkbox" name="ok_with_pets" ${p.ok_with_pets !== 0 ? 'checked' : ''}> OK with pets</label></div>
      <h3 style="margin-top:16px">Languages</h3><div id="langs"></div><button type="button" class="btn ghost sm" id="addLang">+ Add language</button>
      <h3 style="margin-top:16px">Experience with</h3>${chipSet('age_groups', AGE_GROUPS, p.age_groups)}
      <h3 style="margin-top:16px">Skills</h3>${chipSet('skills', SKILLS, p.skills)}
      <h3 style="margin-top:16px">Countries I'd like to go to</h3><p class="muted small">Leave empty if you're open to anywhere.</p>
      ${chipSet('preferred_countries', Object.fromEntries(PROGRAM_CODES.map((c) => [c, cname(c)])), p.preferred_countries)}</div>`
    : `<div class="card"><h2>Family details</h2><div class="form-grid">
      <div class="field"><label>Children's ages (comma separated)</label><input name="children" value="${esc((p.children || []).map((c) => c.age).join(', '))}" placeholder="e.g. 2, 6"></div>
      <div class="field"><label>Start date</label><input type="date" name="start_date" value="${esc(p.start_date)}"></div>
      <div class="field"><label>Stay length (months)</label><input type="number" min="1" max="24" name="duration_months" value="${esc(p.duration_months)}"></div>
      <div class="field"><label>Hours per week</label><input type="number" min="1" max="60" name="weekly_hours" value="${esc(p.weekly_hours)}"></div>
      <div class="field"><label>Pocket money per month (local currency)</label><input type="number" min="0" name="pocket_money" value="${esc(p.pocket_money)}"></div></div>
      <div class="row"><label class="check"><input type="checkbox" name="needs_driver" ${p.needs_driver ? 'checked' : ''}> We need a driver</label>
        <label class="check"><input type="checkbox" name="has_pets" ${p.has_pets ? 'checked' : ''}> We have pets</label>
        <label class="check"><input type="checkbox" name="smoking_household" ${p.smoking_household ? 'checked' : ''}> Someone smokes at home</label>
        <label class="check"><input type="checkbox" name="private_room" ${p.private_room !== 0 ? 'checked' : ''}> Private room for the au pair</label></div>
      <h3 style="margin-top:16px">Languages spoken at home</h3>${chipSet('languages', LANGS, p.languages)}
      <h3 style="margin-top:16px">Au pair must speak</h3>${chipSet('required_languages', LANGS, p.required_languages)}
      <div id="programHint" style="margin-top:16px"></div></div>`}
  <div id="err"></div><button class="btn">Save profile</button></form>`);

  renderPhotoGrid(u.photos || []);
  document.querySelectorAll('.chip-toggle').forEach((b) => { b.onclick = () => b.classList.toggle('on'); });
  if (isAp) {
    const $langs = document.getElementById('langs');
    const addLang = (l = { code: '', level: 'B2' }) => {
      const row = document.createElement('div');
      row.className = 'row lang-row'; row.style.marginBottom = '8px';
      row.innerHTML = `<select class="lc" style="max-width:220px">${options(LANGS, l.code, 'Language…')}</select>
        <select class="ll" style="max-width:120px">${LEVELS.map((v) => `<option ${v === l.level ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button type="button" class="btn ghost sm">Remove</button>`;
      row.querySelector('button').onclick = () => row.remove();
      $langs.appendChild(row);
    };
    (p.languages?.length ? p.languages : [undefined]).forEach((l) => addLang(l));
    document.getElementById('addLang').onclick = () => addLang();
  } else if (u.country) {
    api(`/programs/${u.country}`).then((pr) => {
      document.getElementById('programHint').innerHTML = (pr.status_note ? `<div class="alert ${pr.status === 'closed' ? 'error' : 'warning'} small">${esc(pr.status_note)}</div>` : '') + `<div class="alert info small"><strong>${esc(pr.name)} rules:</strong> au pairs aged ${pr.min_age}-${pr.max_age},
        max ${pr.max_weekly_hours} h/week${pr.min_pocket_money ? `, at least ${pr.min_pocket_money} ${pr.currency}/month pocket money` : ''}. <a href="#/programs/${pr.code}">Full program guide</a></div>`;
    }).catch(() => {});
  }

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
    });
    else Object.assign(profile, {
      children: v.children.split(',').map((s) => s.trim()).filter((s) => s !== '' && !Number.isNaN(Number(s))).map((a) => ({ age: Number(a) })),
      start_date: v.start_date || null, duration_months: num(v.duration_months), weekly_hours: num(v.weekly_hours), pocket_money: num(v.pocket_money),
      needs_driver: f.needs_driver.checked, has_pets: f.has_pets.checked, smoking_household: f.smoking_household.checked, private_room: f.private_room.checked,
      languages: chips('languages'), required_languages: chips('required_languages'),
    });
    try {
      await api('/me', { method: 'PUT', body: { name: v.name, country: v.country, city: v.city, profile } });
      toast('Profile saved'); views.profile();
    } catch (err) { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
};
function renderPhotoGrid(photos) {
  const $g = document.getElementById('photoGrid'); if (!$g) return;
  $g.innerHTML = Array.from({ length: 6 }, (_, i) => (photos[i]
    ? `<div class="photo-slot"><img src="${esc(photos[i])}" alt="">${i === 0 ? '<span class="main-tag">Main</span>' : `<button type="button" class="slot-btn main" data-main="${i}" title="Make main photo">★</button>`}
       <button type="button" class="slot-btn del" data-del="${i}" title="Remove">✕</button></div>`
    : `<label class="photo-slot empty">${i === photos.length ? '<span>＋<br><small>Add photo</small></span><input type="file" accept="image/jpeg,image/png,image/webp" hidden>' : ''}</label>`)).join('');
  const save = async (list) => { const r = await api('/me/photos', { method: 'PUT', body: { photos: list } }); me.user.photos = r.photos; renderPhotoGrid(r.photos); };
  $g.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => confirm('Remove this photo?') && save(photos.filter((_, j) => j !== Number(b.dataset.del))); });
  $g.querySelectorAll('[data-main]').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.main); save([photos[i], ...photos.filter((_, j) => j !== i)]); }; });
  const input = $g.querySelector('input[type=file]');
  if (input) input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    const slot = input.closest('.photo-slot'); slot.innerHTML = '<span>Uploading…</span>';
    try {
      const r = await api('/me/photos', { method: 'POST', body: { data_url: await resizeImage(file) } });
      me.user.photos = r.photos; renderPhotoGrid(r.photos); toast('Photo added');
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
    img.onerror = () => reject(new Error('That file is not an image we can read.'));
    img.src = URL.createObjectURL(file);
  });
}

let PROGRAM_CODES = ['US', 'DE', 'FR', 'NL', 'DK', 'NO', 'SE', 'ES', 'CH', 'GB', 'IE', 'AU', 'BE'];

// ---------- requests ----------
function requestRow(r) {
  const incoming = r.to_user === me.user.id;
  const other = incoming ? { id: r.from_user, name: r.from_name, photo_url: r.from_photo, country: r.from_country } : { id: r.to_user, name: r.to_name, photo_url: r.to_photo, country: r.to_country };
  const statusChip = { pending: '<span class="chip warn">Pending</span>', accepted: '<span class="chip ok">Matched</span>', declined: '<span class="chip">Declined</span>', withdrawn: '<span class="chip">Withdrawn</span>' }[r.status];
  return `<div class="row" style="border-top:1px solid var(--line);padding:12px 0;align-items:flex-start">${avatar(other, 'sm')}
    <div style="flex:1"><div class="spread"><a href="#/u/${other.id}"><strong>${esc(other.name)}</strong></a> ${statusChip}</div>
      <div class="muted small">${cname(other.country)} · ${fmtDate(r.created_at)}</div>
      ${r.message ? `<p class="small" style="margin:4px 0;white-space:pre-wrap">${esc(r.message)}</p>` : ''}
      <div class="row">${r.status === 'pending' && incoming ? `<button class="btn sm" data-act="accept" data-id="${r.id}">Accept</button><button class="btn ghost sm" data-act="decline" data-id="${r.id}">Decline</button>` : ''}
        ${r.status === 'pending' && !incoming ? `<button class="btn ghost sm" data-act="withdraw" data-id="${r.id}">Withdraw</button>` : ''}
        ${r.status === 'accepted' ? `<button class="btn ghost sm" data-chat="${other.id}">Message</button>` : ''}</div></div></div>`;
}
function bindRequestActions(reload) {
  document.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
    try { await api(`/requests/${b.dataset.id}/respond`, { method: 'POST', body: { action: b.dataset.act } }); toast(`Request ${b.dataset.act}ed`); await refreshMe(); reload(); } catch (e) { toast(e.message); }
  }; });
  document.querySelectorAll('[data-chat]').forEach((b) => { b.onclick = async () => {
    const c = await api('/conversations', { method: 'POST', body: { user_id: Number(b.dataset.chat) } }); go(`#/messages/${c.id}`);
  }; });
}
views.requests = async () => {
  const { incoming, outgoing } = await api('/requests');
  render(`<h1>Match requests</h1><div class="cols-2">
    <div class="card"><h2>Received</h2>${incoming.map(requestRow).join('') || '<div class="empty">Nothing yet.</div>'}</div>
    <div class="card"><h2>Sent</h2>${outgoing.map(requestRow).join('') || '<div class="empty">You haven\'t sent any requests. <a href="#/search">Start searching</a>.</div>'}</div></div>`);
  bindRequestActions(views.requests);
};

// ---------- messages ----------
views.messages = async ([convId]) => {
  const { conversations } = await api('/conversations');
  const active = convId ? Number(convId) : conversations[0]?.id;
  render(`<h1>Messages</h1><div class="card chat"><div class="chat-list">${conversations.map((c) => `<a href="#/messages/${c.id}" class="${c.id === active ? 'active' : ''}">
      ${avatar(c.other, 'sm')}<div style="min-width:0;flex:1"><div class="spread"><strong>${esc(c.other.name)}</strong>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}</div>
      <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_body || 'No messages yet')}</div></div></a>`).join('')
    || '<div class="empty">Conversations open when a match request is accepted.</div>'}</div>
    <div class="chat-main" id="chat">${active ? '' : '<div class="empty">Pick a conversation.</div>'}</div></div>`);
  if (!active) return;
  const data = await api(`/conversations/${active}/messages`);
  const $chat = document.getElementById('chat');
  $chat.innerHTML = `<div class="chat-head spread"><a href="#/u/${data.other.id}"><strong>${esc(data.other.name)}</strong></a>
      <span class="muted small">${cname(data.other.country)} <button class="btn ghost sm" id="reportBlock">⚑ Report and block</button></span></div>
    <div class="chat-msgs" id="msgs"></div>
    <form class="chat-form" id="send"><textarea name="body" placeholder="Write a message… (Enter to send)" required></textarea><button class="btn">Send</button></form>`;
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
    } catch (err) { form.body.value = body; if (!needsCode(err)) toast(err.message); }
  };
  document.getElementById('reportBlock').onclick = async () => {
    const reason = prompt('What happened? Our safety team reviews every report. Leave empty to just block.');
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
    <span class="chip ${status}">${p.status}</span></div>
    <div class="muted small">${cname(p.country)} · ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)} · checklist ${p.tasks_done}/${p.tasks_total}</div></div></a>`;
}
views.placements = async ([id]) => {
  if (id) return placementDetail(id);
  const { placements } = await api('/placements');
  render(`<h1>Placements</h1><div class="card">${placements.map(placementRow).join('') || '<div class="empty">No placements yet. After a match is accepted, propose one from the other person\'s profile.</div>'}</div>`);
};

function complianceBox(c) {
  return c.issues.map((i) => `<div class="alert ${i.level}">${i.level === 'error' ? '✖' : i.level === 'warning' ? '⚠' : 'ℹ'} ${esc(i.text)}</div>`).join('')
    + (c.ok ? '<div class="alert ok">✓ Meets the program rules on file.</div>' : '');
}

views['new-placement'] = async ([otherId]) => {
  const d = await api(`/users/${otherId}`);
  const famProfile = me.user.role === 'family' ? me.profile : d.profile;
  const country = me.user.role === 'family' ? me.user.country : d.user.country;
  const start = famProfile?.start_date || new Date().toISOString().slice(0, 10);
  const months = famProfile?.duration_months || 12;
  const endD = new Date(start); endD.setMonth(endD.getMonth() + months); endD.setDate(endD.getDate() - 1);
  render(`<h1>Propose a placement with ${esc(d.user.name)}</h1><div class="cols-2"><form class="card" id="f">
    <p class="muted">Country: <strong>${cname(country)}</strong>. Both sides confirm before it's final.</p>
    <div class="form-grid"><div class="field"><label>Start date</label><input type="date" name="start_date" value="${start}" required></div>
    <div class="field"><label>End date</label><input type="date" name="end_date" value="${endD.toISOString().slice(0, 10)}" required></div>
    <div class="field"><label>Hours per week</label><input type="number" name="weekly_hours" min="1" value="${famProfile?.weekly_hours ?? 30}" required></div>
    <div class="field"><label>Pocket money per month</label><input type="number" name="pocket_money" min="0" value="${famProfile?.pocket_money ?? ''}" required></div></div>
    <div id="err"></div><button class="btn">Send proposal</button></form>
    <div class="card"><h2>Program check</h2><div id="comp" class="muted">Checking…</div></div></div>`);
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
    try { const r = await api('/placements', { method: 'POST', body: body() }); toast('Proposal sent'); go(`#/placements/${r.id}`); }
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
  render(`<div class="spread"><h1>Placement: ${esc(p.aupair.name)} with ${esc(p.family.name)}</h1><span class="chip ${['confirmed', 'active'].includes(p.status) ? 'ok' : p.status === 'proposed' ? 'warn' : ''}">${p.status}</span></div>
  <div class="cols-2"><div>
    <div class="card"><table>
      <tr><th>Country</th><td>${cname(p.country)}${p.program ? ` · <a href="#/programs/${p.program.code}">program guide</a>` : ''}</td></tr>
      <tr><th>Visa route</th><td>${esc(p.program?.visa || 'Check local rules')}</td></tr>
      <tr><th>Dates</th><td>${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}</td></tr>
      <tr><th>Hours / week</th><td>${p.weekly_hours}</td></tr><tr><th>Pocket money</th><td>${p.pocket_money} ${cur} / month</td></tr>
      <tr><th>Confirmed by</th><td>${p.aupair_confirmed ? '✓' : '○'} au pair · ${p.family_confirmed ? '✓' : '○'} family</td></tr></table>
      <div class="row" style="margin-top:12px">
        ${!isAdmin && p.status === 'proposed' && !myConfirmed ? '<button class="btn" id="confirm">Confirm placement</button>' : ''}
        ${!isAdmin ? next.map((s) => `<button class="btn secondary" data-status="${s}">Mark as ${s}</button>`).join('') : ''}
        ${['proposed', 'confirmed', 'active'].includes(p.status) ? '<button class="btn ghost" data-status="cancelled">Cancel</button>' : ''}
        ${!isAdmin ? `<a class="btn ghost" href="#/u/${other.id}">View ${esc(other.name)}</a>` : ''}</div></div>
    <div class="card"><h2>Program check</h2>${complianceBox(p.compliance)}</div>
  </div><div>
    <div class="card"><h2>Checklist</h2><div class="muted small">${p.tasks.filter((t) => t.done).length} of ${p.tasks.length} done</div>
      ${p.tasks.map((t) => `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''} ${isAdmin ? 'disabled' : ''}>
        <span class="t" style="flex:1">${esc(t.title)}</span><span class="chip">${t.owner === 'both' ? 'Both' : t.owner === 'aupair' ? 'Au pair' : 'Family'}</span>
        <span class="muted small" style="min-width:90px;text-align:right">${fmtDate(t.due_date)}</span></label>`).join('')}</div>
    ${p.can_review ? `<form class="card" id="review"><h2>Review ${esc(other.name)}</h2>
      <p class="muted small">Your review stays hidden until ${esc(other.name)} reviews you too, or 14 days after the placement ends.</p>
      <div class="field"><label>Overall</label>${starInput('overall')}</div>
      <div class="form-grid">${p.review_criteria.map((c) => `<div class="field"><label>${CRIT_LABEL[c] || c}</label>${starInput(c)}</div>`).join('')}</div>
      <div class="field"><label>Your experience</label><textarea name="comment" required placeholder="What went well? What should others know?"></textarea></div>
      <div id="err"></div><button class="btn">Submit review</button></form>`
    : p.my_review ? `<div class="card"><h2>Your review</h2>${stars(p.my_review.overall)}<p style="white-space:pre-wrap">${esc(p.my_review.comment)}</p></div>` : ''}
  </div></div>`);
  const reload = () => placementDetail(id);
  const c = document.getElementById('confirm');
  if (c) c.onclick = async () => { await api(`/placements/${id}/confirm`, { method: 'POST' }); toast('Confirmed'); reload(); };
  document.querySelectorAll('[data-status]').forEach((b) => { b.onclick = async () => {
    if (b.dataset.status === 'cancelled' && !confirm('Cancel this placement?')) return;
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
      toast('Thanks for your review!'); reload();
    } catch (err) { document.getElementById('err').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  };
}
const starInput = (name) => `<span class="star-input" data-stars="${name}" data-value="">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n} stars">★</button>`).join('')}</span>`;
function bindStarInputs() {
  document.querySelectorAll('.star-input').forEach((g) => g.querySelectorAll('button').forEach((b) => { b.onclick = () => {
    g.dataset.value = b.dataset.n;
    g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', Number(x.dataset.n) <= Number(b.dataset.n)));
  }; }));
}

// ---------- programs ----------
const statusChip = (p) => (p.status === 'closed' ? `<span class="chip warn" style="background:var(--err-soft);color:var(--err)">${p.eu_eea_only ? 'Closed to non-EU' : 'No au pair route'}</span>`
  : p.status === 'paused' ? '<span class="chip warn">Visas stalled</span>' : '<span class="chip ok">Open</span>');
views.programs = async ([code]) => {
  const { programs } = await api('/programs');
  PROGRAM_CODES = programs.map((p) => p.code);
  if (code) {
    const p = programs.find((x) => x.code === code.toUpperCase());
    if (!p) return render('<div class="empty">No program on file.</div>');
    return render(`<a href="#/programs">← All countries</a><h1 style="margin-top:8px">${cname(p.code)} au pair program ${statusChip(p)}</h1>
      ${p.status_note ? `<div class="alert ${p.status === 'closed' ? 'error' : 'warning'}">${esc(p.status_note)}</div>` : ''}
      <div class="cols-2"><div class="card"><table>
        <tr><th>Visa / route</th><td>${esc(p.visa)}</td></tr><tr><th>Age</th><td>${p.min_age}–${p.max_age}</td></tr>
        <tr><th>Max hours</th><td>${p.max_weekly_hours} per week${p.max_daily_hours ? `, ${p.max_daily_hours} per day` : ''}</td></tr>
        <tr><th>Pocket money</th><td>${p.min_pocket_money ? `From ${p.min_pocket_money} ${p.currency}/month. ` : ''}${esc(p.pocket_money_note)}</td></tr>
        <tr><th>Stay length</th><td>${p.min_months}–${p.max_months} months</td></tr>
        <tr><th>Agency required</th><td>${p.agency_required ? 'Yes' : 'No'}</td></tr>
        ${p.notes ? `<tr><th>Notes</th><td>${esc(p.notes)}</td></tr>` : ''}</table></div>
      <div class="card"><h2>Host family obligations</h2><ul>${p.family_obligations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        <p class="small muted">Last reviewed ${esc(p.last_reviewed)}. Rules change: always confirm with the <a href="${esc(p.official_source)}" target="_blank" rel="noopener">official source</a>.</p></div></div>`);
  }
  render(`<h1>Country programs</h1><p class="muted">Indicative rules for the main au pair destinations. The app uses these to check every placement. Always confirm with the official source.</p>
    <div class="card table-wrap"><table><tr><th>Country</th><th>Status</th><th>Age</th><th>Max h/week</th><th>Min pocket money / month</th><th>Stay</th><th>Agency</th></tr>
    ${programs.map((p) => `<tr><td><a href="#/programs/${p.code}">${cname(p.code)}</a></td><td>${statusChip(p)}</td><td>${p.min_age}–${p.max_age}</td><td>${p.max_weekly_hours}</td>
      <td>${p.min_pocket_money ? `${p.min_pocket_money} ${p.currency}` : '<span class="muted">see guide</span>'}</td><td>${p.min_months}–${p.max_months} mo</td><td>${p.agency_required ? 'Required' : '—'}</td></tr>`).join('')}</table></div>`);
};

// ---------- notifications ----------
views.notifications = async () => {
  const { notifications } = await api('/notifications');
  await api('/notifications/read', { method: 'POST' });
  refreshMe();
  render(`<h1>Notifications</h1><div class="card">${notifications.map((n) => `<a href="${esc(n.link || '#/')}" class="spread" style="padding:10px 0;border-top:1px solid var(--line);color:inherit">
    <span>${n.read ? '' : '🔵 '}${esc(n.text)}</span><span class="muted small">${fmtTime(n.created_at)}</span></a>`).join('') || '<div class="empty">You\'re all caught up.</div>'}</div>`);
};

// ---------- admin ----------
views.admin = async ([tab = 'overview']) => {
  if (me.user.role !== 'admin') return go('#/');
  const tabs = { overview: 'Overview', users: 'Users & verification', reports: 'Reports', programs: 'Program rules', placements: 'Placements' };
  const head = `<h1>Program administration</h1><div class="row" style="margin-bottom:16px">${Object.entries(tabs).map(([k, v]) =>
    `<a class="btn ${k === tab ? '' : 'ghost'} sm" href="#/admin/${k}">${v}</a>`).join('')}</div>`;
  if (tab === 'overview') {
    const s = await api('/admin/stats');
    const tiles = [['Au pairs', s.aupairs], ['Host families', s.families], ['Awaiting ID check', s.pending_verification], ['Pending requests', s.open_requests],
      ['Matches', s.matches], ['Active placements', s.placements_active], ['Completed placements', s.placements_completed], ['Reviews', s.reviews], ['Open reports', s.open_reports]];
    return render(`${head}<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${tiles.map(([k, v]) =>
      `<div class="card"><div class="muted small">${k}</div><div style="font-size:1.8rem;font-weight:800">${v}</div></div>`).join('')}</div>
      <div class="card"><h2>Members by country</h2><table><tr><th>Country</th><th>Role</th><th>Members</th></tr>
      ${s.by_country.map((r) => `<tr><td>${cname(r.country) || '—'}</td><td>${r.role === 'aupair' ? 'Au pair' : 'Family'}</td><td>${r.n}</td></tr>`).join('')}</table></div>`);
  }
  if (tab === 'users') {
    const { users } = await api('/admin/users');
    render(`${head}<div class="card table-wrap"><table><tr><th>Member</th><th>Role</th><th>Rating</th><th>ID</th><th>References</th><th>Background</th><th>Suspended</th></tr>
      ${users.map((u) => `<tr><td><a href="#/u/${u.id}">${esc(u.name)}</a><div class="muted small">${esc(u.email)} · ${cname(u.country)}</div></td>
        <td>${u.role === 'aupair' ? 'Au pair' : 'Family'}</td><td>${u.rating.avg ?? '—'}</td>
        ${['id_verified:id', 'references_checked:references', 'background_checked:background'].map((x) => { const [f, k] = x.split(':');
    return `<td><input type="checkbox" style="width:auto" data-u="${u.id}" data-f="${f}" ${u.verification[k] ? 'checked' : ''}></td>`; }).join('')}
        <td><input type="checkbox" style="width:auto" data-u="${u.id}" data-f="suspended" ${u.suspended ? 'checked' : ''}></td></tr>`).join('')}</table></div>`);
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
  if (!view) return render('<div class="empty">Page not found. <a href="#/">Go home</a></div>');
  if (!me && !PUBLIC.has(name || 'home')) return go('#/login');
  try { await view(args, new URLSearchParams(qs || '')); }
  catch (e) {
    if (e.status === 401) { me = null; return go('#/login'); }
    render(`<div class="alert error">${esc(e.message)}</div>`);
  }
}
window.addEventListener('hashchange', route);
refreshMe().then(route);
setInterval(() => { if (me) api('/me').then((d) => { me = d; renderNav(); }).catch(() => {}); }, 30000);
