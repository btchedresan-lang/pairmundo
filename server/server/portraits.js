// Flat illustrated portraits for demo accounts (no real people's photos in the seed data).

const pick = (arr, n) => arr[Math.abs(n) % arr.length];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

const SKIN = ['#f6d3b3', '#e8b48f', '#d09a6e', '#a8714a', '#7d4f2e', '#5a3820'];
const HAIR = ['#2b1d14', '#4a2f1d', '#7a4b26', '#c08a3e', '#e2c27a', '#1a1a1a', '#8c2f1c'];
const SHIRT = ['#3b5bdb', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#1098ad', '#d6336c', '#495057'];
const BG = [['#ffd8a8', '#ff8787'], ['#a5d8ff', '#748ffc'], ['#b2f2bb', '#38d9a9'], ['#ffc9e3', '#da77f2'], ['#ffec99', '#ffa94d'], ['#c5f6fa', '#4dabf7'], ['#e9ecef', '#adb5bd']];

function person({ cx, base, scale, skin, hair, shirt, style }) {
  const s = scale;
  const headY = base - 330 * s;
  const hairShape = {
    long: `<path d="M${cx - 125 * s} ${headY + 10 * s} C${cx - 140 * s} ${headY - 150 * s} ${cx + 140 * s} ${headY - 150 * s} ${cx + 125 * s} ${headY + 10 * s} L${cx + 135 * s} ${headY + 210 * s} L${cx - 135 * s} ${headY + 210 * s} Z" fill="${hair}"/>`,
    short: '',
    bun: `<circle cx="${cx}" cy="${headY - 140 * s}" r="${48 * s}" fill="${hair}"/>`,
    curly: [-90, -45, 0, 45, 90].map((dx) => `<circle cx="${cx + dx * s}" cy="${headY - 105 * s + Math.abs(dx) * 0.5 * s}" r="${52 * s}" fill="${hair}"/>`).join(''),
  }[style] || '';
  const cap = style === 'curly' ? '' : `<path d="M${cx - 112 * s} ${headY - 5 * s} C${cx - 115 * s} ${headY - 150 * s} ${cx + 115 * s} ${headY - 150 * s} ${cx + 112 * s} ${headY - 5 * s} C${cx + 60 * s} ${headY - 70 * s} ${cx - 60 * s} ${headY - 70 * s} ${cx - 112 * s} ${headY - 5 * s} Z" fill="${hair}"/>`;
  return `<g>${hairShape}
    <path d="M${cx - 240 * s} ${base + 400} C${cx - 240 * s} ${base - 90 * s} ${cx - 120 * s} ${base - 150 * s} ${cx} ${base - 150 * s} C${cx + 120 * s} ${base - 150 * s} ${cx + 240 * s} ${base - 90 * s} ${cx + 240 * s} ${base + 400} Z" fill="${shirt}"/>
    <rect x="${cx - 38 * s}" y="${headY + 100 * s}" width="${76 * s}" height="${90 * s}" rx="${20 * s}" fill="${skin}"/>
    <path d="M${cx - 50 * s} ${base - 150 * s} Q${cx} ${base - 95 * s} ${cx + 50 * s} ${base - 150 * s}" fill="${skin}"/>
    <ellipse cx="${cx}" cy="${headY}" rx="${108 * s}" ry="${128 * s}" fill="${skin}"/>
    ${cap}
    <ellipse cx="${cx - 40 * s}" cy="${headY + 10 * s}" rx="${9 * s}" ry="${12 * s}" fill="#2b2b2b"/>
    <ellipse cx="${cx + 40 * s}" cy="${headY + 10 * s}" rx="${9 * s}" ry="${12 * s}" fill="#2b2b2b"/>
    <circle cx="${cx - 62 * s}" cy="${headY + 48 * s}" r="${16 * s}" fill="#ff8787" opacity=".35"/>
    <circle cx="${cx + 62 * s}" cy="${headY + 48 * s}" r="${16 * s}" fill="#ff8787" opacity=".35"/>
    <path d="M${cx - 34 * s} ${headY + 58 * s} Q${cx} ${headY + 92 * s} ${cx + 34 * s} ${headY + 58 * s}" stroke="#7a2e2e" stroke-width="${7 * s}" fill="none" stroke-linecap="round"/></g>`;
}

function frame(seed, variant, body) {
  const [a, b] = pick(BG, seed + variant * 3);
  const scene = variant === 1
    ? `<circle cx="470" cy="150" r="70" fill="#fff" opacity=".55"/><path d="M0 640 Q150 540 300 620 T600 600 V800 H0Z" fill="#fff" opacity=".25"/>`
    : variant === 2 ? `<g fill="#fff" opacity=".22"><circle cx="90" cy="120" r="40"/><circle cx="520" cy="220" r="26"/><circle cx="460" cy="90" r="14"/></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="600" height="800" fill="url(#g)"/>${scene}${body}</svg>`;
}

export function aupairPortrait(name, variant = 0, opts = {}) {
  const h = hash(name);
  return frame(h, variant, person({
    cx: 300, base: 800, scale: 1.25, skin: opts.skin ?? pick(SKIN, h), hair: pick(HAIR, h >> 3),
    shirt: pick(SHIRT, (h >> 5) + variant), style: opts.style ?? pick(['long', 'short', 'bun', 'curly'], h >> 7),
  }));
}

export function familyPortrait(name, kids = 2, variant = 0) {
  const h = hash(name);
  const people = [
    { cx: 180, base: 700, scale: 0.95, style: pick(['long', 'bun', 'curly'], h) },
    { cx: 420, base: 690, scale: 1, style: pick(['short', 'short', 'curly'], h >> 2) },
  ];
  const kidXs = kids === 1 ? [300] : kids === 2 ? [230, 380] : [170, 300, 430];
  kidXs.slice(0, Math.max(1, kids)).forEach((cx, i) => people.push({ cx, base: 840, scale: 0.6, style: pick(['short', 'long', 'curly', 'bun'], (h >> (4 + i)) + i) }));
  const skin = pick(SKIN, h >> 1);
  return frame(h, variant, people.map((p, i) => person({ ...p, skin: i === 1 ? pick(SKIN, h >> 6) : skin, hair: pick(HAIR, (h >> i) + i), shirt: pick(SHIRT, (h >> 3) + i + variant) })).join(''));
}
