// Lists every piece of English text the website translates, and what each file in public/locales is missing.
//   node scripts/i18n.mjs          report missing and unused translations
//   node scripts/i18n.mjs --fill   also copy translations the phone app already has (../mobile/src/locales)
//   node scripts/i18n.mjs --keys   print the missing keys per language as JSON (handy for translating new text)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const literal = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const unq = (m, i = 1) => (m[i] ?? m[i + 1]).replace(/\\(.)/g, '$1');
const keys = new Set();
const add = (s) => s && keys.add(s);

const web = read('public/app.js');
// Admin pages stay in English; everything before them is translated.
const site = web.slice(0, web.indexOf('// ---------- admin ----------')) + web.slice(web.indexOf('// ---------- Family Pass ----------'));
for (const m of site.matchAll(new RegExp(String.raw`\btr\(\s*(?:${literal})`, 'g'))) add(unq(m));
for (const m of site.matchAll(new RegExp(String.raw`\btrn\([^,]+,\s*(?:${literal})\s*,\s*(?:${literal})`, 'g'))) { add(unq(m, 1)); add(unq(m, 3)); }
// Labels in data maps and in option lists, translated where they are shown.
for (const block of web.matchAll(/const (COUNTRIES|LANGS|AGE_GROUPS|SKILLS|TRAITS|HOBBIES|CRIT_LABEL|STATUSES) = \{([\s\S]*?)\};/g)) {
  // Most maps are key: 'Label'; HOBBIES is key: ['emoji', 'Label'].
  for (const m of block[2].matchAll(new RegExp(String.raw`:\s*(?:\[(?:${literal}),\s*)?(?:${literal})`, 'g'))) add(unq(m, 3));
}
for (const block of site.matchAll(/options\(\{([^}]*)\}/g)) for (const m of block[1].matchAll(new RegExp(String.raw`:\s*(?:${literal})`, 'g'))) add(unq(m));
// Fixed text the server sends (errors, checklist items), which the page translates.
const server = ['app.js', 'matching.js', 'programs.js'].map((f) => read(`server/${f}`)).join('\n');
for (const re of [String.raw`HttpError\(\d+, (?:${literal})`, String.raw`\bbad\((?:${literal})`, String.raw`\berror: (?:${literal})`,
  String.raw`\bmsg = (?:${literal})`, String.raw`\b(?:notFound|forbidden)\((?:${literal})`, String.raw`\{ title: (?:${literal}), owner`]) {
  for (const m of server.matchAll(new RegExp(re, 'g'))) add(unq(m));
}

const all = [...keys].sort();
const sorted = (d) => Object.fromEntries(Object.keys(d).sort().map((k) => [k, d[k]]));
const out = {};
let missingTotal = 0;
for (const f of readdirSync(join(root, 'public/locales')).filter((x) => x.endsWith('.json'))) {
  const path = join(root, 'public/locales', f);
  let dict = JSON.parse(readFileSync(path, 'utf8'));
  const app = join(root, '../mobile/src/locales', f);
  if (process.argv.includes('--fill') && existsSync(app)) {
    const fromApp = JSON.parse(readFileSync(app, 'utf8'));
    for (const k of all) if (!dict[k] && fromApp[k]) dict[k] = fromApp[k];
    writeFileSync(path, JSON.stringify(sorted(dict), null, 2) + '\n');
  }
  const missing = all.filter((k) => !dict[k]);
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  const badVars = all.filter((k) => dict[k] && [...k.matchAll(/\{(\w+)\}/g)].some(([v]) => !dict[k].includes(v)));
  missingTotal += missing.length + badVars.length;
  out[f] = missing;
  if (!process.argv.includes('--keys')) {
    console.log(`${f}: ${all.length - missing.length}/${all.length} translated${unused.length ? `, ${unused.length} unused` : ''}${badVars.length ? `, ${badVars.length} with wrong {placeholders}` : ''}`);
    for (const k of [...missing, ...badVars]) console.log(`  - ${k}`);
  }
}
if (process.argv.includes('--keys')) console.log(JSON.stringify(out, null, 1));
process.exit(missingTotal ? 1 : 0);
