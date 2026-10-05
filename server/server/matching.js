// Matching score and compliance checks. Pure functions so they are easy to test.
import { EU_EEA } from './programs.js';

/** Is there an au pair route into this country for someone of this nationality? */
export function routeOpen(program, nationality) {
  if (!program || program.status !== 'closed') return true;
  return !!program.eu_eea_only && EU_EEA.has(String(nationality || '').toUpperCase());
}

export function ageOn(birthDate, onDate = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const d = new Date(onDate);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

const AGE_GROUP = (age) => (age < 2 ? 'infant' : age < 5 ? 'toddler' : age < 13 ? 'school' : 'teen');
const DAY = 86400000;

/**
 * Score how well an au pair fits a host family (0-100) and explain why.
 * ap: { user, profile } with parsed JSON fields; fam: same shape.
 * program: the country program for the family's country (may be undefined).
 */
export function scoreMatch(ap, fam, program, apRating = null) {
  const reasons = [];
  const warnings = [];
  let score = 0;
  const p = ap.profile;
  const f = fam.profile;

  // Country preference (20)
  const prefs = p.preferred_countries || [];
  if (prefs.length === 0 || prefs.includes(fam.user.country)) {
    score += 20;
    if (prefs.includes(fam.user.country)) reasons.push(`Wants to go to ${program?.name || fam.user.country}`);
  } else {
    warnings.push('Destination is not in the au pair\'s preferred countries');
  }

  // Languages (20)
  const apLangs = (p.languages || []).map((l) => l.code);
  const required = f.required_languages || [];
  const home = f.languages || [];
  if (required.length) {
    const have = required.filter((l) => apLangs.includes(l));
    score += Math.round((20 * have.length) / required.length);
    if (have.length === required.length) reasons.push(`Speaks ${required.join(', ').toUpperCase()}`);
    else warnings.push(`Missing required language: ${required.filter((l) => !apLangs.includes(l)).join(', ').toUpperCase()}`);
  } else if (home.some((l) => apLangs.includes(l))) {
    score += 20;
    reasons.push('Shares a home language');
  } else {
    score += 8;
  }

  // Dates (15): start within 30 days scores full, decays to 0 at 120 days apart
  if (p.available_from && f.start_date) {
    const gap = Math.abs(new Date(p.available_from) - new Date(f.start_date)) / DAY;
    const pts = gap <= 30 ? 15 : Math.max(0, Math.round(15 * (1 - (gap - 30) / 90)));
    score += pts;
    if (gap <= 30) reasons.push('Availability lines up with start date');
    else if (pts === 0) warnings.push('Availability is far from the start date');
  } else score += 7;

  // Duration (10)
  if (p.duration_months && f.duration_months) {
    const diff = Math.abs(p.duration_months - f.duration_months);
    score += diff === 0 ? 10 : diff <= 3 ? 6 : 2;
  } else score += 5;

  // Experience with the children's age groups (20)
  const groups = [...new Set((f.children || []).map((c) => AGE_GROUP(Number(c.age))))];
  const apGroups = p.age_groups || [];
  if (groups.length) {
    const covered = groups.filter((g) => apGroups.includes(g));
    score += Math.round((12 * covered.length) / groups.length);
    if (covered.length === groups.length) reasons.push('Experienced with these children\'s ages');
    if (groups.includes('infant') && !apGroups.includes('infant')) warnings.push('Family has an infant; au pair lists no infant experience');
  } else score += 12;
  score += Math.min(8, Math.round((p.childcare_years || 0) * 2));

  // Practical (10)
  if (f.needs_driver) {
    if (p.drivers_license) { score += 4; reasons.push('Has a driver\'s license'); }
    else warnings.push('Family needs a driver');
  } else score += 4;
  if (f.has_pets && !p.ok_with_pets) warnings.push('Family has pets');
  else score += 3;
  if (f.smoking_household && p.non_smoker) score += 1; else score += 3;

  // Reputation (5)
  if (apRating && apRating.count > 0) score += Math.round((apRating.avg / 5) * 5);
  else score += 2;

  // Program eligibility is a hard gate, surfaced as warnings
  if (program && !routeOpen(program, p.nationality)) {
    warnings.push(`${program.name} has no au pair route for this au pair${program.eu_eea_only ? ' (EU/EEA citizens only)' : ''}`);
    score = Math.min(score, 20);
  } else if (program?.status === 'paused') {
    warnings.push(`${program.name}'s au pair visas are currently stalled`);
  }
  if (program) {
    const age = ageOn(p.birth_date, f.start_date || new Date());
    if (age != null && (age < program.min_age || age > program.max_age)) {
      warnings.push(`Age ${age} is outside ${program.name}'s ${program.min_age}-${program.max_age} range`);
      score = Math.min(score, 30);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, warnings };
}

/** Check a proposed placement against the country program. Returns { ok, issues[] }. */
export function checkCompliance(program, { birth_date, nationality, start_date, end_date, weekly_hours, pocket_money }) {
  const issues = [];
  if (!program) return { ok: true, issues: [{ level: 'info', text: 'No program rules on file for this country; check local regulations.' }] };
  if (!routeOpen(program, nationality)) {
    issues.push({ level: 'error', text: program.status_note || `${program.name} currently has no au pair route.` });
  } else if (program.status === 'closed') {
    issues.push({ level: 'info', text: `${program.status_note || ''} This au pair is an EU/EEA citizen, so free movement applies.`.trim() });
  } else if (program.status === 'paused') {
    issues.push({ level: 'warning', text: program.status_note || `${program.name}'s au pair visas are currently paused.` });
  }
  const age = ageOn(birth_date, start_date);
  if (age != null && (age < program.min_age || age > program.max_age)) {
    issues.push({ level: 'error', text: `Au pair will be ${age} at start; ${program.name} requires ${program.min_age}-${program.max_age}.` });
  }
  if (weekly_hours > program.max_weekly_hours) {
    issues.push({ level: 'error', text: `${weekly_hours} h/week exceeds the ${program.max_weekly_hours} h maximum.` });
  }
  if (program.min_pocket_money != null && pocket_money < program.min_pocket_money) {
    issues.push({ level: 'error', text: `Pocket money ${pocket_money} ${program.currency}/month is below the ${program.min_pocket_money} ${program.currency} minimum.` });
  }
  if (start_date && end_date) {
    const months = (new Date(end_date) - new Date(start_date)) / (DAY * 30.44);
    if (months <= 0) issues.push({ level: 'error', text: 'End date must be after start date.' });
    else {
      if (program.max_months && months > program.max_months + 0.5) issues.push({ level: 'error', text: `Duration of ~${Math.round(months)} months exceeds the ${program.max_months}-month maximum.` });
      if (program.min_months && months < program.min_months - 0.5) issues.push({ level: 'warning', text: `Duration of ~${Math.round(months)} months is below the usual ${program.min_months}-month minimum.` });
    }
  }
  if (program.agency_required) issues.push({ level: 'info', text: `${program.name} requires placement through a recognised agency/sponsor.` });
  if (program.pocket_money_note) issues.push({ level: 'info', text: program.pocket_money_note });
  return { ok: !issues.some((i) => i.level === 'error'), issues };
}
