import { getLang, tr } from './i18n';

export const COUNTRIES = {
  AR: 'Argentina', AT: 'Austria', AU: 'Australia', BE: 'Belgium', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland', CN: 'China', CO: 'Colombia',
  CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', ES: 'Spain', FI: 'Finland', FR: 'France', GB: 'United Kingdom', GH: 'Ghana', GR: 'Greece',
  HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IN: 'India', IT: 'Italy', JP: 'Japan', KE: 'Kenya', KR: 'South Korea', MA: 'Morocco',
  MX: 'Mexico', NG: 'Nigeria', NL: 'Netherlands', NO: 'Norway', NZ: 'New Zealand', PE: 'Peru', PH: 'Philippines', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SN: 'Senegal', TH: 'Thailand', TR: 'Türkiye', UA: 'Ukraine', US: 'United States',
  VN: 'Vietnam', ZA: 'South Africa',
};
export const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish',
  da: 'Danish', no: 'Norwegian', pl: 'Polish', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', th: 'Thai', ar: 'Arabic',
  ru: 'Russian', uk: 'Ukrainian', tr: 'Turkish', af: 'Afrikaans', sw: 'Swahili', hi: 'Hindi', tl: 'Tagalog', ro: 'Romanian' };
export const AGE_GROUPS = { infant: 'Infants (0-2)', toddler: 'Toddlers (2-5)', school: 'School age (5-12)', teen: 'Teens (13+)' };
export const SKILLS = { first_aid: 'First aid', swimming: 'Swimming', cooking: 'Cooking', tutoring: 'Homework help', music: 'Music', art: 'Arts & crafts',
  sports: 'Sports', special_needs: 'Special needs', housekeeping: 'Housekeeping' };
export const CRIT_LABEL = { reliability: 'Reliability', childcare: 'Childcare', communication: 'Communication', household: 'Household help',
  adaptability: 'Adaptability', respect: 'Respect', accommodation: 'Accommodation', fair_hours: 'Fair hours', support: 'Support' };

export const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');
/** Country, language and other labels in the app's language. */
export const country = (cc) => (COUNTRIES[cc] ? tr(COUNTRIES[cc]) : cc || '');
export const langName = (code) => (LANGS[code] ? tr(LANGS[code]) : code);
export const cname = (cc) => (cc ? `${flag(cc)} ${country(cc)}` : '');
export const initials = (name) => String(name || '?').split(/\s+/).filter((w) => !/^(the|family|familie|famille|familia|familien)$/i.test(w))
  .map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const parse = (d) => new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? '' : 'Z'));
export const fmtDate = (d) => (d ? parse(d).toLocaleDateString(getLang(), { year: 'numeric', month: 'short', day: 'numeric' }) : '');
export const fmtTime = (d) => (d ? parse(d).toLocaleString(getLang(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
export const firstName = (name) => { const w = String(name || '').split(' '); return /^(the)$/i.test(w[0]) ? w[1] : w[0]; };
export const STATUSES = { proposed: 'Proposed', confirmed: 'Confirmed', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
export const statusLabel = (s) => (STATUSES[s] ? tr(STATUSES[s]) : s);
export const statusTone = (s) => (s === 'proposed' ? 'warn' : ['confirmed', 'active'].includes(s) ? 'ok' : undefined);
