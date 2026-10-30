// Hiring through PairMundo itself: a public job page with an application form, then the admin's applicant list with
// screening scores, a paid test task the candidate answers on PairMundo, an interview on PairMundo's video calls, and
// a Hire button that turns the candidate into a partner manager.
import { randomBytes } from 'node:crypto';

/** Open roles, shown at pairmundo.com/#/jobs/<slug>. Set open to false to stop new applications. */
export const JOBS = {
  'partnerships-onboarding-manager': {
    open: true,
    title: 'Partnerships Onboarding Manager',
    meta: 'Remote · Part-time (20 hours a week) · Base + commission',
    about: 'PairMundo is an app where au pairs and host families find each other, with ID checks and two-way reviews. We work with au pair agencies worldwide: sending agencies list their au pairs for free, and host agencies get referrals when families want full service. We are a small, early-stage US company.',
    role: 'You run our agency partnerships end to end, in every country: finding agencies, emailing them, following up, booking calls and onboarding the ones who say yes. You work in our own partnerships system, which shows your follow-ups each day and tracks your commission.',
    tasks: [
      'Research au pair agencies and sponsors worldwide and add them to our pipeline',
      'Send personalised email campaigns and follow-ups from ready-made templates',
      'Answer replies within a day, handle objections and book 15-minute calls',
      'Run intro calls, or brief our co-founder before larger ones',
      'Onboard new partners: agreement, one-pager, agency code, and their first au pair profiles',
      'Send a short Friday report',
    ],
    needs: [
      '2+ years in B2B email outreach, lead generation, appointment setting or partnerships',
      'Excellent written and spoken English',
      'Comfortable with spreadsheets, CRMs, mail-merge tools and video calls',
      'Available Monday to Friday, 4 hours a day during European business hours (between 09:00 and 17:00 Central European Time, which is 11:00 to 19:00 in Nairobi)',
      'Reliable internet and power backup',
      'A plus: Spanish, or experience in education, travel, recruitment or the au pair industry',
    ],
    pay: [
      'Base: US$400 to US$500 a month, depending on experience',
      'Commission: US$40 per signed partner, US$80 per activated partner, 7% revenue share on partners you sign (first 12 months), and a US$150 quarterly bonus for 12+ activated partners',
      'Paid monthly in your local currency. Independent contractor, fully remote, with a path to full time',
    ],
    objection: 'We already have our own matching system, so we don\'t need another platform.',
    test: [
      'Research 10 au pair agencies in one country of your choice. For each: name, website, country, email, whether they send au pairs abroad or place them with host families, and the language to write to them in.',
      'Write a personalised first email (under 150 words) to one of them, inviting them to partner with PairMundo.',
      'That agency replies: "Thanks, but we work with a few platforms already and our team is too busy to add another one." Write your answer.',
    ],
    test_pay: 'US$30',
    sign_off: 'Badji Tchedre-San, Co-founder & Partnerships, PairMundo',
  },
};
export const APPLICANT_STATUSES = ['new', 'shortlisted', 'test', 'interview', 'hired', 'rejected'];
const SCORES = ['english', 'research', 'objections', 'organisation', 'hours', 'cost'];
const CV_TYPES = { 'application/pdf': '25504446' };
const MAX_CV = 4 * 1024 * 1024;

export function mountHiring(api, { db, wrap, requireRole, rateLimit, HttpError, str, normEmail, mailer, publicBase, notify, video, addTeamMember }) {
  const bad = (m) => new HttpError(400, m);
  const notFound = () => new HttpError(404, 'Not found.');
  const admin = requireRole('admin');
  const applyLimit = rateLimit({ windowMs: 60 * 60000, max: Number(process.env.APPLY_RATE_LIMIT || 10) });
  const send = (to, subject, text) => Promise.resolve(mailer({ to, subject, text })).catch((e) => console.error('Email failed:', e.message));
  const jobOf = (slug) => { const j = JOBS[slug]; if (!j) throw notFound(); return j; };
  const getApp = (id) => db.prepare('SELECT * FROM job_applications WHERE id = ?').get(Number(id));
  const byToken = (t) => (/^[a-f0-9]{32}$/.test(String(t)) ? db.prepare('SELECT * FROM job_applications WHERE token = ?').get(String(t)) : undefined);
  const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

  /** A quick first read of an application, before anyone opens it: what it is missing, and a 0-100 head start. */
  const screen = (a) => {
    const flags = [];
    if ((a.years_b2b ?? 0) < 2) flags.push('Less than 2 years of B2B outreach');
    if (!a.hours_ok) flags.push("Can't work the hours");
    if (!a.video_url) flags.push('No video');
    if (!a.has_cv) flags.push('No CV');
    if (String(a.campaign_answer ?? '').length < 120) flags.push('Short answer about their campaign');
    if (!/\d/.test(String(a.campaign_answer ?? ''))) flags.push('No numbers in their campaign answer');
    if (String(a.objection_answer ?? '').length < 80) flags.push('Short objection answer');
    const score = Math.max(0, 100 - flags.length * 15 + Math.min(a.years_b2b ?? 0, 6) * 2 + (/(spanish|español|espanol)/i.test(a.languages ?? '') ? 5 : 0));
    return { flags, prescore: Math.min(100, score) };
  };
  const view = (a, full = false) => {
    const { cv_data: _cv, token: _t, ...rest } = a;
    const scores = parse(a.scores, {});
    const total = SCORES.reduce((s, k) => s + (Number(scores[k]) || 0), 0);
    return { ...rest, has_cv: !!a.cv_mime, hours_ok: !!a.hours_ok, scores, score_total: total, ...screen({ ...a, has_cv: !!a.cv_mime }),
      ...(full ? { test_link: a.test_sent_at ? `${publicBase()}/#/jobs/test?t=${a.token}` : null, interview_link: a.interview_at ? `${publicBase()}/api/jobs/interview/${a.token}` : null } : {}) };
  };
  /** When a candidate may join their interview: from 15 minutes before to 2 hours after the start. */
  const callOpen = (a) => a.interview_at && Date.now() >= Date.parse(`${a.interview_at}Z`) - 15 * 60000 && Date.now() <= Date.parse(`${a.interview_at}Z`) + 120 * 60000;
  /** The interview's video room, made on the first join so that a Daily room's two hours start at the interview. */
  const roomFor = async (a) => {
    if (a.call_url && a.call_created_at && Date.now() - Date.parse(`${a.call_created_at}Z`) < 110 * 60000) return a.call_url;
    const url = await video.createRoom();
    db.prepare("UPDATE job_applications SET call_url = ?, call_created_at = datetime('now') WHERE id = ?").run(url, a.id);
    return url;
  };
  const utc = (t) => `${t.replace(' ', ' at ')} UTC`;
  const cet = (t) => new Date(`${t}Z`).toLocaleString('en-GB', { timeZone: 'Europe/Stockholm', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  // ---------- public ----------
  api.get('/jobs/:slug', wrap((req) => {
    const j = jobOf(req.params.slug);
    const { test: _test, ...pub } = j;
    return { slug: req.params.slug, ...pub };
  }));

  api.post('/jobs/:slug/apply', applyLimit, wrap((req, res) => {
    const j = jobOf(req.params.slug);
    if (!j.open) throw bad('This role is closed to new applications.');
    const b = req.body || {};
    const email = normEmail(b.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email.');
    const name = str(b.name, 120);
    if (!name) throw bad('Your name is required.');
    const years = Number(b.years_b2b);
    if (!Number.isFinite(years) || years < 0 || years > 50) throw bad('Enter your years of B2B outreach experience as a number.');
    const video = str(b.video_url, 500);
    if (video && !/^https:\/\/\S+$/.test(video)) throw bad('The video link should start with https://');
    const campaign = str(b.campaign_answer, 3000); const objection = str(b.objection_answer, 3000);
    if (!campaign || !objection) throw bad('Answer both questions.');
    let cv = null;
    if (b.cv) {
      const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.cv));
      if (!m) throw bad('Upload your CV as a PDF.');
      const buf = Buffer.from(m[1], 'base64');
      if (buf.length > MAX_CV) throw bad('Your CV must be under 4 MB.');
      if (!buf.subarray(0, 4).toString('hex').startsWith(CV_TYPES['application/pdf'])) throw bad('That file is not a valid PDF.');
      cv = buf;
    }
    if (db.prepare('SELECT 1 FROM job_applications WHERE job = ? AND email = ?').get(req.params.slug, email)) throw new HttpError(409, "You've already applied with this email. We'll be in touch.");
    const r = db.prepare(`INSERT INTO job_applications (job, name, email, country, phone, linkedin, years_b2b, hours_ok, languages, video_url, campaign_answer, objection_answer, cv_mime, cv_data, token)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.params.slug, name, email, str(b.country, 2)?.toUpperCase() || null, str(b.phone, 60) || null,
      str(b.linkedin, 300) || null, years, b.hours_ok && b.hours_ok !== 'false' ? 1 : 0, str(b.languages, 200) || null, video || null, campaign, objection,
      cv ? 'application/pdf' : null, cv, randomBytes(16).toString('hex'));
    send(email, `We received your application: ${j.title}`, [`Hello ${name},`, '',
      `Thank you for applying to be PairMundo's ${j.title}. We read every application and reply to shortlisted candidates within about a week, with a short paid test task.`, '',
      j.sign_off].join('\n'));
    for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin'").all()) notify(a.id, 'hiring', 'New application for {job}: {name}.', { job: j.title, name }, `#/pipeline/hiring/${r.lastInsertRowid}`);
    res.status(201);
    return { ok: true };
  }));

  // The candidate's test task, opened from the link in their email.
  api.get('/jobs/test/:token', wrap((req) => {
    const a = byToken(req.params.token);
    if (!a?.test_sent_at) throw notFound();
    const j = jobOf(a.job);
    return { name: a.name, title: j.title, test: j.test, test_pay: j.test_pay, answer: a.test_answer, submitted: !!a.test_submitted_at };
  }));
  api.post('/jobs/test/:token', applyLimit, wrap((req) => {
    const a = byToken(req.params.token);
    if (!a?.test_sent_at) throw notFound();
    if (a.test_submitted_at) throw bad("You've already sent your test task. Thank you!");
    const answer = str(req.body?.answer, 20000);
    if (!answer || answer.length < 200) throw bad('Answer all three parts before sending.');
    db.prepare("UPDATE job_applications SET test_answer = ?, test_submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(answer, a.id);
    for (const u of db.prepare("SELECT id FROM users WHERE role = 'admin'").all()) notify(u.id, 'hiring', '{name} sent their test task.', { name: a.name }, `#/pipeline/hiring/${a.id}`);
    return { ok: true };
  }));

  // The candidate's interview link: it opens PairMundo's video call around the interview time.
  api.get('/jobs/interview/:token', async (req, res, next) => {
    try {
      const a = byToken(req.params.token);
      if (!a?.interview_at) return res.status(404).type('html').send(page('This interview link is not valid.'));
      if (!callOpen(a)) return res.type('html').send(page(`Your interview is on ${cet(a.interview_at)} (Central European Time), ${utc(a.interview_at)}. This link opens the call from 15 minutes before.`));
      res.redirect(await video.joinUrl(await roomFor(a), a.name));
    } catch (e) { next(e); }
  });
  const page = (msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/legal.css"><main><h1>PairMundo</h1><p>${msg.replace(/[<>&]/g, '')}</p></main>`;

  // ---------- admin ----------
  api.get('/pipeline/applicants', admin, wrap((req) => {
    const status = APPLICANT_STATUSES.includes(req.query.status) ? req.query.status : null;
    const apps = db.prepare(`SELECT * FROM job_applications${status ? ' WHERE status = ?' : ''} ORDER BY created_at DESC LIMIT 1000`).all(...(status ? [status] : [])).map((a) => view(a));
    const counts = Object.fromEntries(APPLICANT_STATUSES.map((s) => [s, 0]));
    for (const r of db.prepare('SELECT status, COUNT(*) n FROM job_applications GROUP BY status').all()) counts[r.status] = r.n;
    return { statuses: APPLICANT_STATUSES, scores: SCORES, counts, jobs: Object.fromEntries(Object.entries(JOBS).map(([k, j]) => [k, { title: j.title, open: j.open }])),
      applicants: apps.sort((x, y) => (y.score_total - x.score_total) || (y.prescore - x.prescore)) };
  }));
  api.get('/pipeline/applicants/:id', admin, wrap((req) => {
    const a = getApp(req.params.id);
    if (!a) throw notFound();
    const j = JOBS[a.job];
    return { ...view(a, true), job_title: j?.title, objection: j?.objection, test: j?.test, scores_list: SCORES };
  }));
  api.get('/pipeline/applicants/:id/cv', admin, (req, res) => {
    const a = getApp(req.params.id);
    if (!a?.cv_data) return res.status(404).json({ error: 'Not found.' });
    res.set({ 'Content-Type': a.cv_mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' }).send(Buffer.from(a.cv_data));
  });
  api.put('/pipeline/applicants/:id', admin, wrap((req) => {
    const a = getApp(req.params.id);
    if (!a) throw notFound();
    const b = req.body || {};
    if (b.status && !APPLICANT_STATUSES.includes(b.status)) throw bad('Choose a status.');
    if (b.status === 'hired') throw bad('Use Hire to hire someone.');
    let scores = parse(a.scores, {});
    if (b.scores) {
      scores = Object.fromEntries(SCORES.map((k) => [k, b.scores[k] === '' || b.scores[k] == null ? scores[k] ?? null : Number(b.scores[k])]));
      if (Object.values(scores).some((v) => v != null && !(Number.isInteger(v) && v >= 1 && v <= 5))) throw bad('Scores go from 1 to 5.');
    }
    db.prepare("UPDATE job_applications SET status = ?, scores = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(b.status || a.status, JSON.stringify(scores), 'notes' in b ? str(b.notes, 5000) || null : a.notes, a.id);
    if (b.status === 'rejected' && a.status !== 'rejected' && b.email) {
      send(a.email, `Your application: ${JOBS[a.job]?.title}`, [`Hello ${a.name},`, '',
        "Thank you for your time and your interest in PairMundo. We've decided to go ahead with other candidates for this role. We wish you all the best, and we'll keep your details in case something fits later.", '',
        JOBS[a.job]?.sign_off].join('\n'));
    }
    return view(getApp(a.id), true);
  }));
  // Emails the paid test task; the candidate answers it on PairMundo.
  api.post('/pipeline/applicants/:id/test', admin, wrap((req) => {
    const a = getApp(req.params.id);
    if (!a) throw notFound();
    const j = jobOf(a.job);
    db.prepare("UPDATE job_applications SET status = 'test', test_sent_at = COALESCE(test_sent_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(a.id);
    send(a.email, `Next step for the ${j.title} role: a short paid test task`, [`Hello ${a.name},`, '',
      `Thank you for applying. We'd like you to do a short test task: about 2 hours, paid ${j.test_pay} whatever the result.`, '',
      ...j.test.map((t, i) => `${i + 1}. ${t}`), '',
      'Open this page to read the task again and send your answers within 5 days:', `${publicBase()}/#/jobs/test?t=${a.token}`, '',
      j.sign_off].join('\n'));
    return view(getApp(a.id), true);
  }));
  // Books the interview on PairMundo's video calls; the time is entered in UTC and the email shows it in CET too.
  api.post('/pipeline/applicants/:id/interview', admin, wrap((req) => {
    const a = getApp(req.params.id);
    if (!a) throw notFound();
    const at = String(req.body?.interview_at ?? '').replace('T', ' ').slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at) || Number.isNaN(Date.parse(`${at.replace(' ', 'T')}:00Z`))) throw bad('Choose the interview day and time.');
    if (Date.parse(`${at.replace(' ', 'T')}:00Z`) < Date.now()) throw bad('Choose a time in the future.');
    const when = `${at}:00`;
    db.prepare("UPDATE job_applications SET status = 'interview', interview_at = ?, call_url = NULL, call_created_at = NULL, updated_at = datetime('now') WHERE id = ?").run(when, a.id);
    const j = jobOf(a.job);
    send(a.email, `Your interview for the ${j.title} role`, [`Hello ${a.name},`, '',
      `We'd like to meet you on a 30-minute video call: ${cet(when)} Central European Time (${utc(when)}). Please check this in your own time zone.`, '',
      'Join from your computer or phone with this link. It opens the call from 15 minutes before; no app or account is needed:', `${publicBase()}/api/jobs/interview/${a.token}`, '',
      'We will talk through your experience and do a short role-play of a call with an agency. If the time does not work, reply to this email.', '',
      j.sign_off].join('\n'));
    return view(getApp(a.id), true);
  }));
  // The interviewer's own link into the same call.
  api.post('/pipeline/applicants/:id/join', admin, wrap(async (req) => {
    const a = getApp(req.params.id);
    if (!a?.interview_at) throw notFound();
    if (!callOpen(a)) throw bad('The call opens 15 minutes before the interview and closes 2 hours after it starts.');
    return { url: await video.joinUrl(await roomFor(a), req.user.name) };
  }));
  // Hiring someone gives them a partner manager account at the rates entered, and an email to set their password.
  api.post('/pipeline/applicants/:id/hire', admin, wrap((req) => {
    const a = getApp(req.params.id);
    if (!a) throw notFound();
    const member = addTeamMember({ ...(req.body || {}), name: a.name, email: req.body?.email || a.email, country: a.country });
    db.prepare("UPDATE job_applications SET status = 'hired', user_id = ?, updated_at = datetime('now') WHERE id = ?").run(member.user_id, a.id);
    return { ...view(getApp(a.id), true), member };
  }));
}
