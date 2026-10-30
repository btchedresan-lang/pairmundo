// The partnerships pipeline: every agency or partner PairMundo is courting, from first research to an active partner,
// with the next step for each, the commission partner managers earn, and their monthly pay. The admin and partner
// managers (staff with a partner_manager login) work it; managers see only this and their own pay.
import { randomBytes } from 'node:crypto';

export const LEAD_STAGES = ['target', 'contacted', 'replied', 'meeting', 'agreement', 'signed', 'active', 'declined'];
export const LEAD_KINDS = ['host', 'sending', 'sponsor', 'other'];
const ACTIVITY_KINDS = ['note', 'email', 'reply', 'call', 'meeting'];
/** When a signed partner counts as activated: a sending agency once this many of its au pairs joined with its code; any
 *  other partner once a placement or referral of theirs starts. Commission counts if that happens within window_days. */
export const ACTIVATION = { sending_aupairs: 10, window_days: 183 };
/** Days without an answer before a step is due again. */
const WAIT = { contacted: 7, agreement: 5, signed: 30, declined: 30 };

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const addDays = (n, from = new Date()) => day(new Date(from.getTime() + n * 86400000));
const daysSince = (t) => (t ? (Date.now() - Date.parse(t.length === 10 ? t : `${t.replace(' ', 'T')}Z`)) / 86400000 : Infinity);
const isMonth = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v || '');
const money = (v, label) => {
  const n = Math.round(Number(String(v ?? '').replace(',', '.')) * 100);
  if (!Number.isFinite(n) || n < -10000000 || n > 10000000) throw new Error(`${label} is an amount in dollars, like 40 or 12.50.`);
  return n;
};

/** Splits CSV text into rows of cells (quotes, commas or semicolons, and newlines inside quotes). */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** Which lead field a spreadsheet column holds, from its header (the master sheet's and mail-merge headers included). */
const COLUMN = [
  ['name', /^(agency|agency name|name|organi[sz]ation|company|partner)$/],
  ['email', /^(e-?mail|email address|contact email)$/],
  ['country', /^(country|country code)$/],
  ['kind', /^(type|kind|agency type|side)$/],
  ['lang', /^(language|lang)$/],
  ['website', /^(website|web|url|site)$/],
  ['contact_name', /^(contact|contact name|contact person|first name)$/],
  ['phone', /^(phone|telephone|whatsapp)$/],
  ['source', /^(source|wave|list)$/],
  ['notes', /^(notes?|comments?)$/],
];
/** Country codes by English name, so a sheet can say "Germany" as well as "DE". */
const COUNTRY_BY_NAME = (() => {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const out = new Map([['usa', 'US'], ['uk', 'GB'], ['united states of america', 'US'], ['holland', 'NL']]);
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    try { const n = names.of(code); if (n && n !== code) out.set(n.toLowerCase(), code); } catch { /* not a region */ }
  }
  return out;
})();
const LANG_NAMES = { english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', dutch: 'nl', swedish: 'sv', danish: 'da',
  norwegian: 'no', polish: 'pl', japanese: 'ja', chinese: 'zh', korean: 'ko', turkish: 'tr', czech: 'cs', romanian: 'ro', greek: 'el', finnish: 'fi' };

export function mountPipeline(api, { db, wrap, requireRole, HttpError, str, isDate, normEmail, csvCell, mailer, publicBase, hashPassword, notify, teamInviteEmail }) {
  const bad = (m) => new HttpError(400, m);
  const notFound = () => new HttpError(404, 'Not found.');
  const staff = requireRole('admin', 'partner_manager');
  const admin = requireRole('admin');
  const isAdmin = (u) => u.role === 'admin';
  const countryCode = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
    return COUNTRY_BY_NAME.get(s.toLowerCase()) ?? null;
  };
  const langCode = (v) => { const s = String(v ?? '').trim().toLowerCase(); return /^[a-z]{2}$/.test(s) ? s : LANG_NAMES[s] ?? null; };
  const kindOf = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    if (LEAD_KINDS.includes(s)) return s;
    if (/send|recruit|outgoing/.test(s)) return 'sending';
    if (/sponsor|j-?1/.test(s)) return 'sponsor';
    if (/host|incoming|placement/.test(s)) return 'host';
    return s ? 'other' : 'host';
  };

  const log = (leadId, userId, kind, body) => db.prepare('INSERT INTO partner_activity (lead_id, user_id, kind, body) VALUES (?,?,?,?)').run(leadId, userId, kind, body);
  const getLead = (id) => db.prepare('SELECT * FROM partner_leads WHERE id = ?').get(Number(id));
  const teamRow = (userId) => db.prepare('SELECT * FROM partner_team WHERE user_id = ?').get(userId);

  /** How far a linked partner is toward activation, from what really happened in the app. */
  const progressOf = (l) => {
    const code = l.ambassador_id ? db.prepare('SELECT * FROM ambassadors WHERE id = ?').get(l.ambassador_id) : null;
    const aupairs = code ? db.prepare("SELECT COUNT(*) n FROM users WHERE ref_code = ? AND role = 'aupair' AND id IS NOT ?").get(code.code, code.user_id).n : 0;
    const placements = code ? db.prepare(`SELECT COUNT(*) n FROM placements p WHERE p.status IN ('active', 'completed')
      AND EXISTS (SELECT 1 FROM users u WHERE u.id IN (p.aupair_id, p.family_id) AND u.ref_code = ?)`).get(code.code).n : 0;
    const referrals = l.offer_id ? db.prepare("SELECT COUNT(*) n FROM agency_referrals WHERE offer_id = ? AND status = 'started'").get(l.offer_id).n : 0;
    const active = l.kind === 'sending' ? aupairs >= ACTIVATION.sending_aupairs : placements + referrals > 0;
    return { code: code?.code ?? null, aupairs, placements, referrals, active,
      why: l.kind === 'sending' ? `${aupairs} of ${ACTIVATION.sending_aupairs} au pairs joined with code ${code?.code}`
        : `${placements + referrals} referred au pair${placements + referrals === 1 ? '' : 's'} started` };
  };

  /** Records a signed or activated commission for the lead's owner, once, at their rate today. Leads the admin found
   *  and handed over earn half. Nothing is payable until the admin approves it. */
  const earn = (l, kind) => {
    const t = l.owner_id ? teamRow(l.owner_id) : null;
    if (!t) return;
    const full = kind === 'signed' ? t.signed_cents : t.activated_cents;
    const creator = l.created_by ? db.prepare('SELECT role FROM users WHERE id = ?').get(l.created_by) : null;
    const half = creator?.role === 'admin' && l.created_by !== l.owner_id;
    db.prepare('INSERT OR IGNORE INTO partner_commissions (user_id, lead_id, kind, amount_cents, note) VALUES (?,?,?,?,?)')
      .run(l.owner_id, l.id, kind, half ? Math.round(full / 2) : full, `${kind === 'signed' ? 'Signed' : 'Activated'}: ${l.name}${half ? ' (half: lead from the admin)' : ''}`);
  };

  /** Moves signed partners to active when the app shows they are, and records the commission. Safe to run any time. */
  const syncActivations = () => {
    for (const l of db.prepare("SELECT * FROM partner_leads WHERE stage = 'signed' AND (ambassador_id IS NOT NULL OR offer_id IS NOT NULL)").all()) {
      const p = progressOf(l);
      if (!p.active) continue;
      db.prepare("UPDATE partner_leads SET stage = 'active', activated_at = datetime('now'), updated_at = datetime('now'), next_action = NULL, next_action_on = NULL WHERE id = ?").run(l.id);
      log(l.id, null, 'stage', `Activated automatically: ${p.why}.`);
      if (daysSince(l.signed_at) <= ACTIVATION.window_days) earn(l, 'activated');
      if (l.owner_id) notify(l.owner_id, 'pipeline', '{name} is now an active partner.', { name: l.name }, `#/pipeline/lead/${l.id}`);
    }
  };

  /** The suggested next step for a lead, and whether it is due, from its stage and how long it has waited. */
  const suggest = (l) => {
    const type = { host: 'host agency', sending: 'sending agency', sponsor: 'sponsor', other: 'partner' }[l.kind];
    const s = {
      target: ['Send the first email, using the template for this language and agency type.', true],
      contacted: [`Send the follow-up if they haven't replied (${WAIT.contacted} days after the first email).`, daysSince(l.contacted_at) >= WAIT.contacted],
      replied: [`Answer within a day: offer a 15-minute call and send the one-pager for a ${type}.`, true],
      meeting: l.meeting_at && l.meeting_at.slice(0, 10) < day()
        ? ['Send the recap and the partner agreement, then move it to Agreement sent.', true]
        : l.meeting_at ? ['Prepare the call sheet: their pain points, the pitch and the objections to expect.', l.meeting_at.slice(0, 10) <= addDays(1)]
          : ['Book the call and add its date here.', true],
      agreement: ['Chase the signature, and offer to walk through the agreement on a call.', daysSince(l.updated_at) >= WAIT.agreement],
      signed: [l.kind === 'sending'
        ? `Onboard: share their code link and help their au pairs create profiles (${ACTIVATION.sending_aupairs} activate them).`
        : 'Onboard: set up their referral offer and check in until the first referred au pair starts.', daysSince(l.signed_at) >= WAIT.signed],
      active: ['Keep in touch monthly and ask for introductions to other agencies.', false],
      declined: [l.objection ? `Find a way around "${l.objection}": a new angle, tailored terms or a smaller first step.` : 'Note why they said no, then try a smaller first step.', daysSince(l.declined_at) >= WAIT.declined],
    }[l.stage];
    const due = (l.next_action_on && l.next_action_on <= day()) || (!l.next_action_on && s[1]);
    return { text: l.next_action || s[0], suggested: s[0], due: !!due };
  };

  const leadView = (l) => ({ ...l, onboarding_done: !!l.onboarding_done, next: suggest(l),
    owner_name: l.owner_id ? db.prepare('SELECT name FROM users WHERE id = ?').get(l.owner_id)?.name ?? null : null });

  /** Stage changes stamp when they happened, and only the admin, who signs agreements, can mark a partner signed. */
  const setStage = (l, stage, user) => {
    if (!LEAD_STAGES.includes(stage)) throw bad('Choose a stage.');
    if (stage === l.stage) return;
    if ((stage === 'signed' || stage === 'active' || l.stage === 'active' || l.stage === 'signed') && !isAdmin(user)) {
      throw new HttpError(403, 'Only the admin can mark a partner signed or active, or move one back.');
    }
    if (stage === 'signed' && (!l.agreement_url || !l.onboarding_done)) throw bad('Add the signed agreement and tick "Onboarding call done" first.');
    const stamp = { contacted: 'contacted_at', replied: 'replied_at', signed: 'signed_at', active: 'activated_at', declined: 'declined_at' }[stage];
    db.prepare(`UPDATE partner_leads SET stage = ?, ${stamp ? `${stamp} = COALESCE(${stamp}, datetime('now')),` : ''} next_action = NULL, next_action_on = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(stage, stage === 'contacted' ? addDays(WAIT.contacted) : null, l.id);
    log(l.id, user.id, 'stage', `Moved from ${l.stage} to ${stage}.`);
    const now = getLead(l.id);
    if (stage === 'signed') earn(now, 'signed');
    if (stage === 'active') earn(now, 'activated');
  };

  const leadFields = (b, l = {}, user) => {
    const out = {};
    const text = (k, max = 300) => { if (k in b) out[k] = str(b[k], max) || null; };
    text('name', 200); text('website'); text('contact_name', 200); text('phone', 60); text('source', 60); text('next_action', 300);
    text('objection', 500); text('notes', 5000); text('agreement_url', 500);
    if ('name' in out && !out.name) throw bad('Name is required.');
    if ('email' in b) { out.email = normEmail(b.email) || null; if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw bad('Enter a valid email.'); }
    if ('country' in b) out.country = countryCode(b.country);
    if ('lang' in b) out.lang = langCode(b.lang);
    if ('kind' in b) out.kind = kindOf(b.kind);
    if ('next_action_on' in b) { if (b.next_action_on && !isDate(b.next_action_on)) throw bad('The next step date is YYYY-MM-DD.'); out.next_action_on = b.next_action_on || null; }
    if ('meeting_at' in b) { const v = str(b.meeting_at, 20); if (v && Number.isNaN(Date.parse(v))) throw bad('Enter the meeting date and time.'); out.meeting_at = v ? v.replace('T', ' ') : null; }
    if ('onboarding_done' in b) out.onboarding_done = b.onboarding_done && b.onboarding_done !== 'false' ? 1 : 0;
    for (const k of ['ambassador_id', 'offer_id', 'owner_id']) {
      if (!(k in b)) continue;
      const v = b[k] === '' || b[k] == null ? null : Number(b[k]);
      if (k === 'owner_id' && !isAdmin(user) && v !== user.id && v !== l.owner_id) throw new HttpError(403, 'Only the admin can hand a lead to someone else.');
      const table = { ambassador_id: 'ambassadors', offer_id: 'partner_offers', owner_id: 'users' }[k];
      if (v != null && !db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(v)) throw bad('That link no longer exists.');
      out[k] = v;
    }
    return out;
  };

  // ---------- the pipeline ----------
  api.get('/pipeline', staff, wrap((req) => {
    syncActivations();
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const stage = LEAD_STAGES.includes(req.query.stage) ? req.query.stage : null;
    const mine = req.query.owner === 'me' ? req.user.id : req.query.owner ? Number(req.query.owner) : null;
    const leads = db.prepare(`SELECT * FROM partner_leads WHERE 1 = 1${stage ? ' AND stage = ?' : ''}${mine ? ' AND owner_id = ?' : ''}
        ${q ? " AND (lower(name) LIKE ? OR lower(coalesce(email, '')) LIKE ? OR lower(coalesce(country, '')) = ?)" : ''}
        ORDER BY updated_at DESC, id DESC LIMIT 2000`)
      .all(...[stage, mine].filter((x) => x != null), ...(q ? [`%${q}%`, `%${q}%`, q] : [])).map(leadView);
    const counts = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0]));
    for (const r of db.prepare('SELECT stage, COUNT(*) n FROM partner_leads GROUP BY stage').all()) counts[r.stage] = r.n;
    const due = db.prepare("SELECT * FROM partner_leads WHERE stage <> 'active'").all().map(leadView).filter((l) => l.next.due && (!mine || l.owner_id === mine))
      .sort((a, b) => LEAD_STAGES.indexOf(b.stage) - LEAD_STAGES.indexOf(a.stage)).slice(0, 200);
    return { stages: LEAD_STAGES, kinds: LEAD_KINDS, counts, leads, due, activation: ACTIVATION,
      team: db.prepare("SELECT id, name, role FROM users WHERE role = 'admin' OR id IN (SELECT user_id FROM partner_team WHERE active = 1) ORDER BY role, name").all(),
      codes: db.prepare("SELECT id, code, name FROM ambassadors WHERE kind = 'agency' ORDER BY name").all(),
      offers: db.prepare('SELECT id, name FROM partner_offers ORDER BY name').all() };
  }));

  api.post('/pipeline/leads', staff, wrap((req, res) => {
    const f = leadFields(req.body || {}, {}, req.user);
    if (!f.name) throw bad('Name is required.');
    if (f.email && db.prepare('SELECT 1 FROM partner_leads WHERE email = ?').get(f.email)) throw new HttpError(409, 'A lead with this email is already in the pipeline.');
    f.owner_id = f.owner_id ?? (isAdmin(req.user) ? null : req.user.id);
    f.created_by = req.user.id;
    const keys = Object.keys(f);
    const r = db.prepare(`INSERT INTO partner_leads (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => f[k]));
    log(r.lastInsertRowid, req.user.id, 'stage', 'Added to the pipeline.');
    res.status(201);
    return leadView(getLead(r.lastInsertRowid));
  }));

  api.get('/pipeline/leads/:id', staff, wrap((req) => {
    syncActivations();
    const l = getLead(req.params.id);
    if (!l) throw notFound();
    return { ...leadView(l), progress: progressOf(l),
      activity: db.prepare('SELECT a.*, u.name user_name FROM partner_activity a LEFT JOIN users u ON u.id = a.user_id WHERE lead_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 300').all(l.id),
      commissions: db.prepare(`SELECT c.*, u.name user_name FROM partner_commissions c JOIN users u ON u.id = c.user_id WHERE lead_id = ?${isAdmin(req.user) ? '' : ' AND c.user_id = ?'} ORDER BY c.id`)
        .all(l.id, ...(isAdmin(req.user) ? [] : [req.user.id])) };
  }));

  api.put('/pipeline/leads/:id', staff, wrap((req) => {
    const l = getLead(req.params.id);
    if (!l) throw notFound();
    const body = req.body || {};
    const f = leadFields(body, l, req.user);
    if (f.email && f.email !== l.email && db.prepare('SELECT 1 FROM partner_leads WHERE email = ? AND id <> ?').get(f.email, l.id)) throw new HttpError(409, 'Another lead has this email.');
    const keys = Object.keys(f);
    if (keys.length) db.prepare(`UPDATE partner_leads SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...keys.map((k) => f[k]), l.id);
    if (f.meeting_at && f.meeting_at !== l.meeting_at) log(l.id, req.user.id, 'meeting', `Meeting set for ${f.meeting_at}.`);
    if (body.stage) setStage(getLead(l.id), body.stage, req.user);
    return leadView(getLead(l.id));
  }));

  api.delete('/pipeline/leads/:id', admin, wrap((req) => {
    const l = getLead(req.params.id);
    if (!l) throw notFound();
    if (db.prepare('SELECT 1 FROM partner_commissions WHERE lead_id = ? AND paid_at IS NOT NULL').get(l.id)) throw bad('A commission for this partner was paid, so it stays.');
    db.prepare('DELETE FROM partner_commissions WHERE lead_id = ?').run(l.id);
    db.prepare('DELETE FROM partner_leads WHERE id = ?').run(l.id);
    return { ok: true };
  }));

  // Logging what happened moves the lead along: a reply to a contacted lead makes it replied, a meeting makes it a meeting.
  api.post('/pipeline/leads/:id/activity', staff, wrap((req, res) => {
    const l = getLead(req.params.id);
    if (!l) throw notFound();
    const kind = ACTIVITY_KINDS.includes(req.body?.kind) ? req.body.kind : null;
    const body = str(req.body?.body, 3000);
    if (!kind || !body) throw bad('Choose what happened and write a line about it.');
    log(l.id, req.user.id, kind, body);
    db.prepare("UPDATE partner_leads SET updated_at = datetime('now') WHERE id = ?").run(l.id);
    if (kind === 'email' && l.stage === 'target') setStage(l, 'contacted', req.user);
    if (kind === 'reply' && ['target', 'contacted'].includes(l.stage)) setStage(l, 'replied', req.user);
    if (kind === 'meeting' && ['target', 'contacted', 'replied'].includes(l.stage)) setStage(l, 'meeting', req.user);
    res.status(201);
    return leadView(getLead(l.id));
  }));

  // After a mail-merge wave: mark the leads that got the email as contacted (follow-up due in a week), or hand them over.
  api.post('/pipeline/bulk', staff, wrap((req) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger).slice(0, 2000);
    if (!ids.length) throw bad('Select some leads first.');
    let changed = 0;
    for (const id of ids) {
      const l = getLead(id);
      if (!l) continue;
      if (req.body.stage) { if (l.stage !== req.body.stage) { setStage(l, req.body.stage, req.user); changed++; } }
      else if ('owner_id' in req.body) {
        const f = leadFields({ owner_id: req.body.owner_id }, l, req.user);
        db.prepare("UPDATE partner_leads SET owner_id = ?, updated_at = datetime('now') WHERE id = ?").run(f.owner_id, l.id);
        changed++;
      }
    }
    return { changed };
  }));

  // Paste or upload the master spreadsheet as CSV. Known emails are skipped (or, with update, get empty fields filled).
  api.post('/pipeline/import', staff, wrap((req) => {
    const rows = parseCsv(req.body?.csv);
    if (rows.length < 2) throw bad('Paste a CSV with a header row and at least one lead.');
    if (rows.length > 3001) throw bad('Import up to 3,000 leads at a time.');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const map = header.map((h) => COLUMN.find(([, re]) => re.test(h))?.[0] ?? null);
    if (!map.includes('name')) throw bad('The CSV needs a column called Agency or Name.');
    const source = str(req.body?.source, 60) || null;
    let added = 0; let skipped = 0; let updated = 0;
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const raw = Object.fromEntries(map.map((k, j) => [k, r[j]]).filter(([k, v]) => k && v != null && String(v).trim() !== ''));
      if (!raw.name) { skipped++; return; }
      let f;
      try { f = leadFields({ ...raw, email: raw.email?.split(/[\s,;]+/)[0], source: raw.source ?? source }, {}, req.user); }
      catch (e) { errors.push(`Row ${i + 2}: ${e.message}`); skipped++; return; }
      const known = f.email ? db.prepare('SELECT * FROM partner_leads WHERE email = ?').get(f.email)
        : db.prepare('SELECT * FROM partner_leads WHERE lower(name) = lower(?) AND coalesce(country, \'\') = coalesce(?, \'\')').get(f.name, f.country ?? null);
      if (known) {
        const fill = Object.keys(f).filter((k) => f[k] != null && known[k] == null);
        if (req.body.update && fill.length) {
          db.prepare(`UPDATE partner_leads SET ${fill.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...fill.map((k) => f[k]), known.id);
          updated++;
        } else skipped++;
        return;
      }
      f.owner_id = isAdmin(req.user) ? (req.body.owner_id ? Number(req.body.owner_id) : null) : req.user.id;
      f.created_by = req.user.id;
      if (req.body.stage === 'contacted') { f.stage = 'contacted'; f.contacted_at = day(); f.next_action_on = addDays(WAIT.contacted); }
      const keys = Object.keys(f);
      const ins = db.prepare(`INSERT INTO partner_leads (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => f[k]));
      log(ins.lastInsertRowid, req.user.id, 'stage', `Imported${f.source ? ` from ${f.source}` : ''}.`);
      added++;
    });
    return { added, updated, skipped, errors: errors.slice(0, 20) };
  }));

  api.get('/pipeline.csv', staff, (req, res) => {
    const cols = ['id', 'name', 'country', 'kind', 'email', 'lang', 'website', 'contact_name', 'phone', 'source', 'stage', 'owner', 'next_action', 'next_action_on',
      'objection', 'contacted_at', 'replied_at', 'meeting_at', 'signed_at', 'activated_at', 'notes'];
    const rows = db.prepare('SELECT l.*, u.name owner FROM partner_leads l LEFT JOIN users u ON u.id = l.owner_id ORDER BY l.id').all();
    res.set('Content-Disposition', `attachment; filename="pairmundo-partners-${day()}.csv"`).type('text/csv')
      .send([cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
  });

  // ---------- the weekly report ----------
  /** What happened between two days (inclusive), for everyone or one owner: the Friday report, in numbers and words. */
  api.get('/pipeline/report', staff, wrap((req) => {
    const to = isDate(req.query.to) ? req.query.to : day();
    const from = isDate(req.query.from) ? req.query.from : addDays(-6, new Date(`${to}T00:00:00Z`));
    const owner = isAdmin(req.user) ? (req.query.owner ? Number(req.query.owner) : null) : req.user.id;
    const range = (col) => `date(${col}) BETWEEN ? AND ?`;
    const by = owner ? ' AND owner_id = ?' : '';
    const n = (col) => db.prepare(`SELECT COUNT(*) n FROM partner_leads WHERE ${range(col)}${by}`).get(from, to, ...(owner ? [owner] : [])).n;
    const acts = (kind) => db.prepare(`SELECT COUNT(*) n FROM partner_activity a JOIN partner_leads l ON l.id = a.lead_id WHERE a.kind = ? AND ${range('a.created_at')}${owner ? ' AND l.owner_id = ?' : ''}`)
      .get(kind, from, to, ...(owner ? [owner] : [])).n;
    const contacted = n('contacted_at'); const replied = n('replied_at');
    const nums = { added: n('created_at'), contacted, follow_ups: Math.max(0, acts('email')), replied, reply_rate: contacted ? Math.round((replied / contacted) * 100) : null,
      meetings: acts('meeting'), signed: n('signed_at'), activated: n('activated_at'), declined: n('declined_at') };
    const names = (col) => db.prepare(`SELECT name FROM partner_leads WHERE ${range(col)}${by} ORDER BY ${col}`).all(from, to, ...(owner ? [owner] : [])).map((r) => r.name);
    const stuck = db.prepare(`SELECT * FROM partner_leads WHERE stage IN ('replied', 'meeting', 'agreement', 'signed')${by}`).all(...(owner ? [owner] : [])).map(leadView).filter((l) => l.next.due);
    const text = [`Partnerships update, ${from} to ${to}`, '',
      `Emails: ${nums.contacted} first emails, ${nums.follow_ups} other emails logged. Replies: ${nums.replied}${nums.reply_rate != null ? ` (${nums.reply_rate}% of first emails this week)` : ''}.`,
      `Meetings: ${nums.meetings}. Signed: ${nums.signed}${nums.signed ? ` (${names('signed_at').join(', ')})` : ''}. Activated: ${nums.activated}${nums.activated ? ` (${names('activated_at').join(', ')})` : ''}. Declined: ${nums.declined}.`,
      '', stuck.length ? `Needs attention (${stuck.length}):\n${stuck.slice(0, 10).map((l) => `- ${l.name} (${l.stage}): ${l.next.text}`).join('\n')}` : 'Nothing overdue past the reply stage.'].join('\n');
    return { from, to, numbers: nums, text };
  }));

  // ---------- pay ----------
  /** One person's month: base, commission approved and still to approve, and whether it was paid. */
  const statement = (userId, month) => {
    const t = teamRow(userId);
    const lines = db.prepare(`SELECT c.*, l.name lead_name FROM partner_commissions c LEFT JOIN partner_leads l ON l.id = c.lead_id
      WHERE c.user_id = ? AND strftime('%Y-%m', c.created_at) = ? ORDER BY c.created_at, c.id`).all(userId, month);
    const base = db.prepare('SELECT * FROM partner_base_pay WHERE user_id = ? AND month = ?').get(userId, month);
    const approved = lines.filter((c) => c.approved_at).reduce((s, c) => s + c.amount_cents, 0);
    const pending = lines.filter((c) => !c.approved_at).reduce((s, c) => s + c.amount_cents, 0);
    const baseCents = base?.amount_cents ?? t?.base_cents ?? 0;
    const qStart = `${month.slice(0, 4)}-${String(Math.floor((Number(month.slice(5)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    const quarterActivated = db.prepare("SELECT COUNT(*) n FROM partner_commissions WHERE user_id = ? AND kind = 'activated' AND date(created_at) >= ? AND strftime('%Y-%m', created_at) <= ?").get(userId, qStart, month).n;
    return { user_id: userId, name: db.prepare('SELECT name FROM users WHERE id = ?').get(userId)?.name, month, rates: t ?? null, lines,
      base_cents: baseCents, approved_cents: approved, pending_cents: pending, total_cents: baseCents + approved, base_paid: !!base,
      unpaid_cents: lines.filter((c) => c.approved_at && !c.paid_at).reduce((s, c) => s + c.amount_cents, 0) + (base ? 0 : baseCents),
      quarter_activated: quarterActivated };
  };

  api.get('/pipeline/pay', staff, wrap((req) => {
    syncActivations();
    const month = isMonth(req.query.month) ? req.query.month : day().slice(0, 7);
    const people = isAdmin(req.user) ? db.prepare('SELECT user_id FROM partner_team ORDER BY active DESC, created_at').all().map((r) => r.user_id) : [req.user.id];
    return { month, statements: people.map((id) => statement(id, month)),
      ...(isAdmin(req.user) ? {
        to_approve: db.prepare(`SELECT c.*, u.name user_name, l.name lead_name FROM partner_commissions c JOIN users u ON u.id = c.user_id
          LEFT JOIN partner_leads l ON l.id = c.lead_id WHERE c.approved_at IS NULL ORDER BY c.created_at`).all(),
        team: db.prepare('SELECT t.*, u.name, u.email, u.suspended FROM partner_team t JOIN users u ON u.id = t.user_id ORDER BY t.active DESC, u.name').all(),
      } : {}) };
  }));

  api.post('/pipeline/pay/approve', admin, wrap((req) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    let approved = 0;
    for (const id of ids) approved += db.prepare("UPDATE partner_commissions SET approved_at = datetime('now') WHERE id = ? AND approved_at IS NULL").run(id).changes;
    return { approved };
  }));

  // Revenue share, the quarterly bonus or a correction: added by the admin, approved as it is added.
  api.post('/pipeline/pay/lines', admin, wrap((req, res) => {
    const b = req.body || {};
    const userId = Number(b.user_id);
    if (!teamRow(userId)) throw bad('Choose someone on the team.');
    const kind = ['revenue', 'bonus', 'adjustment'].includes(b.kind) ? b.kind : null;
    if (!kind) throw bad('Choose revenue share, bonus or adjustment.');
    let amount;
    try { amount = money(b.amount, 'The amount'); } catch (e) { throw bad(e.message); }
    if (!amount) throw bad('Enter an amount.');
    const leadId = b.lead_id ? Number(b.lead_id) : null;
    if (leadId && !getLead(leadId)) throw bad('That partner is not in the pipeline.');
    const r = db.prepare("INSERT INTO partner_commissions (user_id, lead_id, kind, amount_cents, note, approved_at) VALUES (?,?,?,?,?, datetime('now'))")
      .run(userId, leadId, kind, amount, str(b.note, 300) || null);
    res.status(201);
    return db.prepare('SELECT * FROM partner_commissions WHERE id = ?').get(r.lastInsertRowid);
  }));

  api.delete('/pipeline/pay/lines/:id', admin, wrap((req) => {
    const c = db.prepare('SELECT * FROM partner_commissions WHERE id = ?').get(Number(req.params.id));
    if (!c) throw notFound();
    if (c.paid_at) throw bad('That line is already paid.');
    db.prepare('DELETE FROM partner_commissions WHERE id = ?').run(c.id);
    return { ok: true };
  }));

  // After paying someone: records that month's base and marks approved commission up to the end of the month as paid.
  api.post('/pipeline/pay/paid', admin, wrap((req) => {
    const userId = Number(req.body?.user_id);
    const t = teamRow(userId);
    if (!t) throw bad('Choose someone on the team.');
    const month = isMonth(req.body?.month) ? req.body.month : null;
    if (!month) throw bad('Choose the month you paid.');
    db.prepare('INSERT OR IGNORE INTO partner_base_pay (user_id, month, amount_cents) VALUES (?,?,?)').run(userId, month, t.base_cents);
    const marked = db.prepare("UPDATE partner_commissions SET paid_at = datetime('now') WHERE user_id = ? AND approved_at IS NOT NULL AND paid_at IS NULL AND strftime('%Y-%m', created_at) <= ?").run(userId, month).changes;
    notify(userId, 'pipeline', 'Your pay for {month} has been sent.', { month }, '#/pipeline/pay');
    return { marked, ...statement(userId, month) };
  }));

  api.get('/pipeline/pay.csv', admin, (req, res) => {
    const month = isMonth(req.query.month) ? req.query.month : day().slice(0, 7);
    const usd = (c) => (c / 100).toFixed(2);
    const rows = db.prepare('SELECT user_id FROM partner_team ORDER BY created_at').all().map((r) => statement(r.user_id, month));
    res.set('Content-Disposition', `attachment; filename="pairmundo-partner-pay-${month}.csv"`).type('text/csv')
      .send(['name,month,base (USD),commission approved (USD),total (USD),still to approve (USD),base paid',
        ...rows.map((s) => [s.name, month, usd(s.base_cents), usd(s.approved_cents), usd(s.total_cents), usd(s.pending_cents), s.base_paid ? 'yes' : 'no'].map(csvCell).join(','))].join('\n') + '\n');
  });

  // ---------- the team ----------
  const rates = (b, t = {}) => {
    const out = {};
    try {
      for (const [k, label] of [['base_cents', 'Base'], ['signed_cents', 'Per signed partner'], ['activated_cents', 'Per activated partner']]) {
        const key = k.replace('_cents', '');
        out[k] = key in b && b[key] !== '' ? money(b[key], label) : t[k] ?? { base_cents: 40000, signed_cents: 4000, activated_cents: 8000 }[k];
        if (out[k] < 0) throw new Error(`${label} can't be negative.`);
      }
    } catch (e) { throw bad(e.message); }
    const pct = 'revshare_pct' in b && b.revshare_pct !== '' ? Number(b.revshare_pct) : t.revshare_pct ?? 7;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw bad('Revenue share is a percentage from 0 to 100.');
    return { ...out, revshare_pct: pct };
  };

  /** Adds a partner manager: an account that sees only the pipeline, and an email inviting them to set a password. */
  const addTeamMember = (b) => {
    const email = normEmail(b.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email.');
    const name = str(b.name, 120);
    if (!name) throw bad('Name is required.');
    const r = rates(b);
    let user = db.prepare('SELECT * FROM users WHERE lower(trim(email)) = ?').get(email);
    if (user && user.role !== 'partner_manager') throw new HttpError(409, 'That email already has a member, agency or admin account. Use their work email.');
    if (!user) {
      const id = db.prepare("INSERT INTO users (email, password_hash, role, name, country) VALUES (?,?, 'partner_manager', ?, ?)")
        .run(email, hashPassword(randomBytes(24).toString('hex')), name, countryCode(b.country)).lastInsertRowid;
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    db.prepare(`INSERT INTO partner_team (user_id, base_cents, signed_cents, activated_cents, revshare_pct) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET base_cents = excluded.base_cents, signed_cents = excluded.signed_cents, activated_cents = excluded.activated_cents,
      revshare_pct = excluded.revshare_pct, active = 1`).run(user.id, r.base_cents, r.signed_cents, r.activated_cents, r.revshare_pct);
    db.prepare('UPDATE users SET suspended = 0 WHERE id = ?').run(user.id);
    Promise.resolve(mailer({ to: email, ...teamInviteEmail({ name, email, link: `${publicBase()}/#/forgot` }) })).catch((e) => console.error('Email failed:', e.message));
    return { ...teamRow(user.id), name, email };
  };
  api.post('/pipeline/team', admin, wrap((req, res) => {
    const out = addTeamMember(req.body || {});
    res.status(201);
    return out;
  }));

  // Changing rates applies to what is earned from now on. Pausing someone signs them out and stops their login.
  api.put('/pipeline/team/:userId', admin, wrap((req) => {
    const t = teamRow(Number(req.params.userId));
    if (!t) throw notFound();
    const r = rates(req.body || {}, t);
    const active = 'active' in (req.body || {}) ? (req.body.active && req.body.active !== 'false' ? 1 : 0) : t.active;
    db.prepare('UPDATE partner_team SET base_cents = ?, signed_cents = ?, activated_cents = ?, revshare_pct = ?, active = ? WHERE user_id = ?')
      .run(r.base_cents, r.signed_cents, r.activated_cents, r.revshare_pct, active, t.user_id);
    db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(active ? 0 : 1, t.user_id);
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(t.user_id);
    return teamRow(t.user_id);
  }));

  return { syncActivations, suggest, addTeamMember };
}
