import { getLang, tr } from './i18n';

export const COUNTRIES = {
  AD: 'Andorra', AE: 'United Arab Emirates', AF: 'Afghanistan', AG: 'Antigua and Barbuda', AL: 'Albania', AM: 'Armenia', AO: 'Angola',
  AR: 'Argentina', AT: 'Austria', AU: 'Australia', AZ: 'Azerbaijan', BA: 'Bosnia and Herzegovina', BB: 'Barbados', BD: 'Bangladesh',
  BE: 'Belgium', BF: 'Burkina Faso', BG: 'Bulgaria', BH: 'Bahrain', BI: 'Burundi', BJ: 'Benin', BN: 'Brunei', BO: 'Bolivia', BR: 'Brazil',
  BS: 'Bahamas', BT: 'Bhutan', BW: 'Botswana', BY: 'Belarus', BZ: 'Belize', CA: 'Canada', CD: 'DR Congo', CF: 'Central African Republic',
  CG: 'Congo', CH: 'Switzerland', CI: "Côte d'Ivoire", CL: 'Chile', CM: 'Cameroon', CN: 'China', CO: 'Colombia', CR: 'Costa Rica',
  CU: 'Cuba', CV: 'Cape Verde', CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DJ: 'Djibouti', DK: 'Denmark', DM: 'Dominica',
  DO: 'Dominican Republic', DZ: 'Algeria', EC: 'Ecuador', EE: 'Estonia', EG: 'Egypt', ER: 'Eritrea', ES: 'Spain', ET: 'Ethiopia',
  FI: 'Finland', FJ: 'Fiji', FM: 'Micronesia', FR: 'France', GA: 'Gabon', GB: 'United Kingdom', GD: 'Grenada', GE: 'Georgia', GH: 'Ghana',
  GM: 'Gambia', GN: 'Guinea', GQ: 'Equatorial Guinea', GR: 'Greece', GT: 'Guatemala', GW: 'Guinea-Bissau', GY: 'Guyana', HN: 'Honduras',
  HR: 'Croatia', HT: 'Haiti', HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IN: 'India', IQ: 'Iraq', IR: 'Iran',
  IS: 'Iceland', IT: 'Italy', JM: 'Jamaica', JO: 'Jordan', JP: 'Japan', KE: 'Kenya', KG: 'Kyrgyzstan', KH: 'Cambodia', KI: 'Kiribati',
  KM: 'Comoros', KN: 'Saint Kitts and Nevis', KP: 'North Korea', KR: 'South Korea', KW: 'Kuwait', KZ: 'Kazakhstan', LA: 'Laos',
  LB: 'Lebanon', LC: 'Saint Lucia', LI: 'Liechtenstein', LK: 'Sri Lanka', LR: 'Liberia', LS: 'Lesotho', LT: 'Lithuania', LU: 'Luxembourg',
  LV: 'Latvia', LY: 'Libya', MA: 'Morocco', MC: 'Monaco', MD: 'Moldova', ME: 'Montenegro', MG: 'Madagascar', MH: 'Marshall Islands',
  MK: 'North Macedonia', ML: 'Mali', MM: 'Myanmar', MN: 'Mongolia', MR: 'Mauritania', MT: 'Malta', MU: 'Mauritius', MV: 'Maldives',
  MW: 'Malawi', MX: 'Mexico', MY: 'Malaysia', MZ: 'Mozambique', NA: 'Namibia', NE: 'Niger', NG: 'Nigeria', NI: 'Nicaragua',
  NL: 'Netherlands', NO: 'Norway', NP: 'Nepal', NR: 'Nauru', NZ: 'New Zealand', OM: 'Oman', PA: 'Panama', PE: 'Peru',
  PG: 'Papua New Guinea', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland', PT: 'Portugal', PW: 'Palau', PY: 'Paraguay', QA: 'Qatar',
  RO: 'Romania', RS: 'Serbia', RU: 'Russia', RW: 'Rwanda', SA: 'Saudi Arabia', SB: 'Solomon Islands', SC: 'Seychelles', SD: 'Sudan',
  SE: 'Sweden', SG: 'Singapore', SI: 'Slovenia', SK: 'Slovakia', SL: 'Sierra Leone', SM: 'San Marino', SN: 'Senegal', SO: 'Somalia',
  SR: 'Suriname', SS: 'South Sudan', ST: 'São Tomé and Príncipe', SV: 'El Salvador', SY: 'Syria', SZ: 'Eswatini', TD: 'Chad', TG: 'Togo',
  TH: 'Thailand', TJ: 'Tajikistan', TL: 'Timor-Leste', TM: 'Turkmenistan', TN: 'Tunisia', TO: 'Tonga', TR: 'Türkiye',
  TT: 'Trinidad and Tobago', TV: 'Tuvalu', TZ: 'Tanzania', UA: 'Ukraine', UG: 'Uganda', US: 'United States', UY: 'Uruguay',
  UZ: 'Uzbekistan', VC: 'Saint Vincent and the Grenadines', VE: 'Venezuela', VN: 'Vietnam', VU: 'Vanuatu', WS: 'Samoa', YE: 'Yemen',
  ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe',
};
export const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', sv: 'Swedish',
  da: 'Danish', no: 'Norwegian', pl: 'Polish', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', th: 'Thai', ar: 'Arabic',
  ru: 'Russian', uk: 'Ukrainian', tr: 'Turkish', af: 'Afrikaans', sw: 'Swahili', hi: 'Hindi', tl: 'Tagalog', ro: 'Romanian' };
/** Languages offered first in profile pickers. */
export const TOP_LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'pl', 'zh', 'vi', 'tl', 'af'];
export const AGE_GROUPS = { infant: 'Infants (0-2)', toddler: 'Toddlers (2-5)', school: 'School age (5-12)', teen: 'Teens (13+)' };
export const SKILLS = { first_aid: 'First aid', swimming: 'Swimming', cooking: 'Cooking', tutoring: 'Homework help', music: 'Music', art: 'Arts & crafts',
  sports: 'Sports', special_needs: 'Special needs', housekeeping: 'Housekeeping' };
/** Personality words and hobbies an au pair can pick for the poster-style profile. */
export const TRAITS = { patient: 'Patient', caring: 'Caring', responsible: 'Responsible', fun: 'Fun', calm: 'Calm', creative: 'Creative',
  curious: 'Curious', organised: 'Organised', sporty: 'Sporty', cheerful: 'Cheerful', flexible: 'Flexible', reliable: 'Reliable' };
export const HOBBIES = { travel: ['✈️', 'Travelling'], outdoors: ['⛰️', 'Hiking and nature'], skiing: ['⛷️', 'Skiing'], beach: ['🌊', 'The ocean'],
  animals: ['🐾', 'Animals'], movies: ['🎬', 'Movies and series'], sports: ['⚽', 'Sports'], music: ['🎵', 'Music'], reading: ['📚', 'Reading'],
  cooking: ['🍳', 'Cooking and baking'], art: ['🎨', 'Drawing and crafts'], dancing: ['💃', 'Dancing'], photography: ['📷', 'Photography'],
  friends: ['👯', 'Time with friends'], languages: ['🗣️', 'Learning languages'], gaming: ['🎮', 'Games'] };
/** Certificates an au pair can add, with an example for the short note next to each. */
export const CERTS = { language: ['🗣️', 'Language certificate', 'For example: IELTS 7.0 or Goethe B2'],
  cpr: ['❤️', 'CPR for babies and children', 'For example: Red Cross, 2026'], first_aid: ['⛑️', 'Paediatric first aid', 'For example: St John Ambulance, 2025'],
  childcare: ['🧸', 'Childcare or teaching qualification', 'For example: early childhood education diploma'],
  swimming: ['🏊', 'Lifeguard or swimming instructor', 'For example: pool lifeguard, 2024'],
  police: ['📄', 'Police clearance certificate', 'For example: issued March 2026'] };
/** Language levels on the CEFR scale, best first. */
export const LEVELS = ['native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];
export const levelName = (l) => (l === 'native' ? tr('native') : l);
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
