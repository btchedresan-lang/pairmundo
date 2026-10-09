// The au pair agreement for a confirmed placement, written from the placement and the country's program rules.
// Every sentence is c(text, vars) with the text in English: the apps translate it, and their i18n checks look for c( calls in this file.
import { AGREEMENT_DEFAULTS } from './programs.js';

const c = (text, vars = {}) => [text, vars];

/** Terms both sides can change before signing. Numbers are null until someone fills them in. */
export const TERM_FIELDS = ['days_off', 'paid_leave_weeks', 'notice_weeks', 'language_support', 'duties', 'house_rules'];
export const REQUIRED_TERMS = ['days_off', 'paid_leave_weeks', 'notice_weeks'];
export const defaultTerms = (country) => ({ days_off: null, paid_leave_weeks: null, notice_weeks: 2, language_support: '', duties: '', house_rules: '',
  ...AGREEMENT_DEFAULTS[country] });

/** Checks and tidies terms sent by a user. Returns the clean terms or throws via bad(). */
export function cleanTerms(input, current, bad) {
  const t = { ...current };
  const num = (k, min, max) => {
    if (input[k] === undefined) return;
    if (input[k] === null || input[k] === '') { t[k] = null; return; }
    const n = Number(input[k]);
    if (!Number.isFinite(n) || n < min || n > max) throw bad('Please check the numbers in the agreement.');
    t[k] = Math.round(n * 2) / 2;
  };
  num('days_off', 1, 4); num('paid_leave_weeks', 0, 10); num('notice_weeks', 0, 12);
  for (const [k, max] of [['language_support', 200], ['duties', 1500], ['house_rules', 1500]]) {
    if (input[k] !== undefined) t[k] = String(input[k] ?? '').trim().slice(0, max);
  }
  return t;
}

/** The agreement as sections of sentences. Names, places and amounts come in as variables. */
export function buildAgreement({ placement: p, program, aupair, family, nationalityName, countryName, terms }) {
  const cur = program?.currency || '';
  const sections = [
    { title: c('Who this agreement is between'), clauses: [
      c('{family}, the host family, living in {place}.', { family: family.name, place: [family.city, countryName].filter(Boolean).join(', ') }),
      c('{aupair}, the au pair, from {country}.', { aupair: aupair.name, country: nationalityName || '' }),
    ] },
    { title: c('The stay'), clauses: [
      c('The au pair lives with the family in {country} from {start} to {end}.', { country: countryName, start: p.start_date, end: p.end_date }),
      c('The au pair is a member of the household, not a domestic worker, and joins in family life.'),
      program?.visa ? c('Visa or permit route: {visa}.', { visa: program.visa }) : null,
    ] },
    { title: c('Hours and time off'), clauses: [
      c('The au pair helps with childcare and light housework for up to {hours} hours a week.', { hours: p.weekly_hours }),
      program?.max_daily_hours ? c('No more than {hours} hours on any one day.', { hours: program.max_daily_hours }) : null,
      terms.days_off != null ? c('{days} days off each week.', { days: terms.days_off }) : c('Days off each week: still to be agreed.'),
      terms.paid_leave_weeks != null ? c('{weeks} weeks of paid holiday a year.', { weeks: terms.paid_leave_weeks }) : c('Paid holiday: still to be agreed.'),
      c('Time to attend a language course.'),
    ] },
    { title: c('Pocket money, room and costs'), clauses: [
      c('The family pays {amount} {currency} pocket money each month.', { amount: p.pocket_money, currency: cur }),
      c('The family gives the au pair a private room and meals at no cost.'),
      terms.language_support ? c('Language course: {support}.', { support: terms.language_support }) : null,
      c('The family meets the other duties of the au pair program in {country}, as listed in the program guide.', { country: countryName }),
    ] },
    terms.duties ? { title: c('Daily duties'), text: terms.duties } : null,
    terms.house_rules ? { title: c('House rules'), text: terms.house_rules } : null,
    { title: c('Ending early'), clauses: [
      terms.notice_weeks != null ? c('Either side can end the stay early with {weeks} weeks of notice, or at once for a serious reason.', { weeks: terms.notice_weeks })
        : c('Notice period: still to be agreed.'),
      c('If there is a problem, talk first. PairMundo support can help you find a solution.'),
    ] },
    { title: c('About this agreement'), clauses: [
      c('PairMundo wrote this from the au pair rules for {country}. It is not legal advice, and some countries also ask for their own official form. Check the program guide.', { country: countryName }),
    ] },
  ].filter(Boolean);
  return sections.map((s) => ({ ...s, clauses: s.clauses?.filter(Boolean) }));
}
