// status: 'open' | 'paused' (route exists but visas are not being granted) | 'closed' (no au pair route).
// eu_eea_only: the non-EU route is gone but EU/EEA citizens can still come under free movement.
// Corrections of Oct 2026 are sourced from the agency research sheet (aupair/research/au-pair-agency-partners.xlsx).

// Indicative country program rules used for compliance checks and the "Programs" guide.
// Figures change regularly (pocket money is often indexed yearly). Admins can edit every
// field in the app; always confirm against the official source before a placement.

export const PROGRAMS = [
  {
    code: 'US', name: 'United States', currency: 'USD',
    visa: 'J-1 Exchange Visitor (Au Pair category), only through a State Department designated sponsor',
    min_age: 18, max_age: 26, max_weekly_hours: 45, max_daily_hours: 10,
    min_pocket_money: 848, pocket_money_note: 'Weekly stipend of at least USD 195.75 under federal rules (shown here per month); some states require more.',
    min_months: 12, max_months: 24, agency_required: 1,
    family_obligations: ['Private bedroom and meals', 'Up to USD 500 toward 6 credit hours of study', 'Two weeks paid vacation', 'Infant care (<2 yrs) only with 200+ hours infant experience'],
    notes: 'Initial 12 months; extensions of 6, 9 or 12 months via sponsor.',
    official_source: 'https://j1visa.state.gov/programs/au-pair',
  },
  {
    code: 'DE', name: 'Germany', currency: 'EUR',
    visa: 'National visa for au pairs (non-EU); EU citizens register locally',
    min_age: 18, max_age: 26, max_weekly_hours: 30, max_daily_hours: 6,
    min_pocket_money: 280, pocket_money_note: 'Pocket money EUR 280/month plus EUR 70/month toward a German course.',
    min_months: 6, max_months: 12, agency_required: 0,
    family_obligations: ['Health, accident and liability insurance', 'Private room and board', 'Language course contribution', '1.5 free days per week, 4 weeks paid leave per year'],
    notes: 'Basic German (A1) required for the visa.',
    official_source: 'https://www.arbeitsagentur.de',
  },
  {
    code: 'FR', name: 'France', currency: 'EUR',
    visa: 'Long-stay visa "au pair" (non-EU), requires enrolment in French classes',
    min_age: 18, max_age: 30, max_weekly_hours: 25, max_daily_hours: 5,
    min_pocket_money: 320, pocket_money_note: 'Roughly EUR 320+ per month, indexed to the minimum wage.',
    min_months: 3, max_months: 24, agency_required: 0,
    family_obligations: ['Signed au pair agreement (accord de placement)', 'Private room and board', 'Time to attend language classes', 'One full day off per week'],
    notes: 'Up to two evenings of babysitting per week on top of 25 hours.',
    official_source: 'https://france-visas.gouv.fr',
  },
  {
    code: 'NL', name: 'Netherlands', currency: 'EUR',
    visa: 'Residence permit "exchange - au pair" via an IND-recognised sponsor (non-EU)',
    min_age: 18, max_age: 25, max_weekly_hours: 30, max_daily_hours: 8,
    min_pocket_money: null, pocket_money_note: 'Maximum EUR 340/month pocket money (a cap, not a minimum).',
    min_months: 1, max_months: 12, agency_required: 1,
    family_obligations: ['Recognised au pair agency must sponsor', 'Private room and board', 'Insurance', 'At least 2 days off per week'],
    notes: 'Light household tasks only; non-EU au pairs may not have worked as au pair in NL before.',
    official_source: 'https://www.rijksoverheid.nl/onderwerpen/buitenlandse-werknemers/vraag-en-antwoord/wanneer-mag-een-au-pair-in-nederland-werken',
  },
  {
    code: 'DK', name: 'Denmark', currency: 'DKK',
    visa: 'Au pair residence permit (non-EU/Nordic)',
    min_age: 18, max_age: 29, max_weekly_hours: 30, max_daily_hours: 5,
    min_pocket_money: 4950, pocket_money_note: 'Minimum is set yearly by SIRI; check the current figure.',
    min_months: 1, max_months: 24, agency_required: 0,
    family_obligations: ['Signed au pair contract', 'Health and accident insurance', 'Danish language course', 'Return ticket contribution', 'Family pays a processing fee'],
    notes: 'Minimum 18 hours/week, maximum 30.',
    official_source: 'https://www.nyidanmark.dk',
  },
  {
    code: 'NO', name: 'Norway', currency: 'NOK', status: 'closed', eu_eea_only: 1,
    status_note: 'Norway abolished the au pair residence permit on 15 March 2024. Non-EU au pairs can no longer come; EU/EEA citizens can still move under free movement rules.',
    visa: 'None for non-EU nationals since 15 March 2024; EU/EEA citizens only, under free movement',
    min_age: 18, max_age: 30, max_weekly_hours: 30, max_daily_hours: 5,
    min_pocket_money: 6600, pocket_money_note: 'Minimum set by UDI each year (before tax); check the current figure.',
    min_months: 1, max_months: 24, agency_required: 0,
    family_obligations: ['Standard au pair contract', 'Norwegian course costs', 'Insurance', 'Private room'],
    notes: 'Rules below are the last ones that applied and serve only as a guide for EU/EEA arrangements.',
    official_source: 'https://www.lifeinnorway.net/au-pair-jobs-in-norway/',
  },
  {
    code: 'SE', name: 'Sweden', currency: 'SEK',
    visa: 'Work permit for au pairs (non-EU), Swedish course required',
    min_age: 18, max_age: 29, max_weekly_hours: 25, max_daily_hours: null,
    min_pocket_money: 3500, pocket_money_note: 'Indicative; Migrationsverket publishes the current minimum.',
    min_months: 1, max_months: 12, agency_required: 0,
    family_obligations: ['Swedish language course of 15+ hours/week', 'Insurance', 'Board and lodging'],
    notes: '',
    official_source: 'https://www.migrationsverket.se/en/you-want-to-apply/work/temporary-work-in-sweden/au-pairs.html',
  },
  {
    code: 'ES', name: 'Spain', currency: 'EUR',
    visa: 'Student visa (non-EU), typically tied to language studies',
    min_age: 17, max_age: 30, max_weekly_hours: 30, max_daily_hours: 5,
    min_pocket_money: 280, pocket_money_note: 'Customary EUR 70-80/week; no fixed statutory minimum.',
    min_months: 3, max_months: 12, agency_required: 0,
    family_obligations: ['Private room and board', 'Time for language classes', 'One full day off per week'],
    notes: 'Spain follows the 1969 European Agreement on Au Pair Placement.',
    official_source: 'https://www.exteriores.gob.es',
  },
  {
    code: 'CH', name: 'Switzerland', currency: 'CHF',
    visa: 'Permit L (non-EU/EFTA, limited quotas); EU/EFTA register with canton',
    min_age: 17, max_age: 25, max_weekly_hours: 30, max_daily_hours: null,
    min_pocket_money: 700, pocket_money_note: 'Varies by canton; check cantonal standard contract.',
    min_months: 6, max_months: 12, agency_required: 0,
    family_obligations: ['Cantonal standard contract (NAV)', 'Language course of 2+ hours/week', 'Insurance'],
    notes: '',
    official_source: 'https://www.sem.admin.ch',
  },
  {
    code: 'GB', name: 'United Kingdom', currency: 'GBP', status: 'closed',
    status_note: 'The UK has had no au pair visa route since 1 January 2021. A UK-EU Youth Experience Scheme that could cover au pairing was still under negotiation in March 2026.',
    visa: 'No au pair visa route since 1 January 2021',
    min_age: 18, max_age: 30, max_weekly_hours: 30, max_daily_hours: 5,
    min_pocket_money: 390, pocket_money_note: 'Customary GBP 90-100/week; if treated as a worker, National Minimum Wage rules apply.',
    min_months: 6, max_months: 24, agency_required: 0,
    family_obligations: ['Private room and board', 'Check employment status carefully'],
    notes: 'Rules below are the customary pre-2021 terms, kept for reference only.',
    official_source: 'https://iapa.org/is-this-the-end-of-the-au-pair-programme-in-the-uk/',
  },
  {
    code: 'IE', name: 'Ireland', currency: 'EUR',
    visa: 'Working Holiday Authorisation or EU free movement',
    min_age: 18, max_age: 30, max_weekly_hours: 39, max_daily_hours: null,
    min_pocket_money: null, pocket_money_note: 'Au pairs are employees in Ireland; National Minimum Wage applies (board/lodging deductions capped).',
    min_months: 3, max_months: 12, agency_required: 0,
    family_obligations: ['Employment contract', 'Minimum wage and PRSI registration', 'Annual leave entitlements'],
    notes: '',
    official_source: 'https://www.workplacerelations.ie',
  },
  {
    code: 'AU', name: 'Australia', currency: 'AUD', status: 'paused',
    status_note: 'Working Holiday visa processing has stalled since 1 July 2026: agencies report no approvals, and the 462 stream is paused for 23 of 29 countries.',
    visa: 'Working Holiday (subclass 417) or Work and Holiday (subclass 462)',
    min_age: 18, max_age: 30, max_weekly_hours: 35, max_daily_hours: null,
    min_pocket_money: null, pocket_money_note: 'Fair Work rules apply to paid care work; check the current award.',
    min_months: 3, max_months: 12, agency_required: 0,
    family_obligations: ['Private room and board', 'Pay per Fair Work requirements'],
    notes: 'Age limit 35 for some nationalities.',
    official_source: 'https://iapa.org/2026/08/19/no-visas-no-answers-australias-working-holiday-visa-delays-leave-au-pairs-and-families-in-limbo/',
  },
  {
    code: 'BE', name: 'Belgium', currency: 'EUR',
    visa: 'Single permit for au pairs (non-EU)',
    min_age: 18, max_age: 26, max_weekly_hours: 20, max_daily_hours: 4,
    min_pocket_money: 450, pocket_money_note: 'Statutory minimum, check regional updates.',
    min_months: 1, max_months: 12, agency_required: 0,
    family_obligations: ['Language course enrolment', 'Insurance', 'Private room and board'],
    notes: '',
    official_source: 'https://www.belgium.be',
  },
];

// EU/EEA (plus Switzerland) nationals, who keep free-movement access where an au pair permit is closed to others.
export const EU_EEA = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH']);

export const REVIEW_CRITERIA = {
  // What a family rates an au pair on
  aupair: ['reliability', 'childcare', 'communication', 'household', 'adaptability'],
  // What an au pair rates a family on
  family: ['respect', 'accommodation', 'communication', 'fair_hours', 'support'],
};

/** Standard placement checklist; dates are relative to start (days). */
export const PLACEMENT_TASKS = [
  { title: 'Sign au pair agreement / contract', owner: 'both', offset: -60 },
  { title: 'Apply for visa or residence permit', owner: 'aupair', offset: -56 },
  { title: 'Arrange health, accident and liability insurance', owner: 'family', offset: -30 },
  { title: 'Book travel', owner: 'aupair', offset: -21 },
  { title: 'Enrol in language course', owner: 'aupair', offset: -7 },
  { title: 'Prepare private room', owner: 'family', offset: -3 },
  { title: 'Arrival and local registration', owner: 'both', offset: 3 },
  { title: 'First-month check-in', owner: 'both', offset: 30 },
  { title: 'Mid-term review', owner: 'both', offset: 'mid' },
  { title: 'Leave review for each other', owner: 'both', offset: 'end' },
];
