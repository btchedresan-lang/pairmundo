// Lists every piece of English text the app translates, and what each language file is missing.
//   node scripts/i18n.mjs          report missing and unused translations
//   node scripts/i18n.mjs --keys   print all keys as JSON (handy for translating new text)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(root, p)).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const literal = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const unq = (m, i = 1) => (m[i] ?? m[i + 1]).replace(/\\(.)/g, '$1');
const keys = new Set();
const add = (s) => s && keys.add(s);

for (const f of walk('src')) {
  const src = read(f);
  for (const m of src.matchAll(new RegExp(String.raw`\btr\(\s*(?:${literal})`, 'g'))) add(unq(m));
  for (const m of src.matchAll(new RegExp(String.raw`\btrn\([^,]+,\s*(?:${literal})\s*,\s*(?:${literal})`, 'g'))) { add(unq(m, 1)); add(unq(m, 3)); }
}
// Labels kept in data maps and brand.json, translated where they are shown.
const data = read('src/data.js');
for (const block of data.matchAll(/export const (COUNTRIES|LANGS|AGE_GROUPS|SKILLS|CRIT_LABEL|STATUSES) = \{([\s\S]*?)\};/g)) {
  for (const m of block[2].matchAll(new RegExp(String.raw`:\s*(?:${literal})`, 'g'))) add(unq(m));
}
add(JSON.parse(read('brand.json')).tagline);
['Host family', 'Au pair'].forEach(add);
// Fixed text the server sends (errors, match reasons, checklist items). Text built from numbers or names stays English for now.
const server = ['app.js', 'matching.js', 'programs.js'].map((f) => read(`../server/server/${f}`)).join('\n');
for (const re of [String.raw`HttpError\(\d+, (?:${literal})`, String.raw`\bbad\((?:${literal})`, String.raw`(?:reasons|warnings)\.push\((?:${literal})\)`,
  String.raw`\btext: (?:${literal})`, String.raw`\berror: (?:${literal})`, String.raw`\bmsg = (?:${literal})`, String.raw`\b(?:notFound|forbidden)\((?:${literal})`, String.raw`\{ title: (?:${literal}), owner`]) {
  for (const m of server.matchAll(new RegExp(re, 'g'))) add(unq(m));
}

const all = [...keys].sort();
if (process.argv.includes('--keys')) { console.log(JSON.stringify(all, null, 1)); process.exit(0); }
let missingTotal = 0;
for (const f of readdirSync(join(root, 'src/locales'))) {
  const dict = JSON.parse(read(`src/locales/${f}`));
  const missing = all.filter((k) => !dict[k]);
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  const badVars = all.filter((k) => dict[k] && [...k.matchAll(/\{(\w+)\}/g)].some(([v]) => !dict[k].includes(v)));
  missingTotal += missing.length + badVars.length;
  console.log(`${f}: ${all.length - missing.length}/${all.length} translated${unused.length ? `, ${unused.length} unused` : ''}${badVars.length ? `, ${badVars.length} with wrong {placeholders}` : ''}`);
  for (const k of [...missing, ...badVars]) console.log(`  - ${k}`);
}
process.exit(missingTotal ? 1 : 0);
