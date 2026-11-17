import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';

let server; let base; let db;
const outbox = []; const pushed = [];
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.INVITE_GAP_MS = '0';
  process.env.UPLOAD_DIR = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/aupair-msg-');
  db = openDb(':memory:');
  const app = createApp(db, { mailer: async (m) => { if (m.to === 'fail@test.io') throw new Error('Daily limit reached'); outbox.push(m); },
    pusher: async (msgs) => { pushed.push(...msgs); return msgs.map(() => ({ status: 'ok' })); },
    moderator: async () => ({ verdict: 'allow', category: 'none', note: '' }) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
};
const login = async (email) => (await call(null, 'POST', '/auth/login', { email, password: 'password123' })).body.token;
const user = (email, role, name, country, extra = {}) => {
  const cols = { email, password_hash: hashPassword('password123'), role, name, country, email_verified: 1, ...extra };
  return Number(db.prepare(`INSERT INTO users (${Object.keys(cols).join(',')}) VALUES (${Object.keys(cols).map(() => '?').join(',')})`).run(...Object.values(cols)).lastInsertRowid);
};
const wait = async (f) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };

test('admin messages members by group or by name, in the app and by email, honouring unsubscribes', async () => {
  user('admin@test.io', 'admin', 'Admin', 'SE');
  const anna = user('anna@test.io', 'family', 'Anna Svensson', 'SE', { city: 'Stockholm' });
  const bo = user('bo@test.io', 'family', 'Bo Berg', 'SE', { city: 'Göteborg' });
  const maria = user('maria@test.io', 'aupair', 'Maria Lopez', 'ES');
  user('demo@demo.pairmundo.com', 'family', 'Demo Family', 'SE', { demo: 1 });
  user('gone@test.io', 'family', 'Suspended Family', 'SE', { suspended: 1 });
  const fail = user('fail@test.io', 'family', 'Failing Mailbox', 'SE');
  const admin = await login('admin@test.io');

  // Only the admin can use it.
  assert.equal((await call(await login('anna@test.io'), 'POST', '/admin/messages/preview', { audience: { roles: ['family'] } })).status, 403);

  // Who it reaches: demo and suspended accounts are left out; country and city narrow it down.
  let r = await call(admin, 'POST', '/admin/messages/preview', { audience: { roles: ['family', 'aupair'] } });
  assert.equal(r.body.count, 4);
  assert.deepEqual(r.body.by_role, { family: 3, aupair: 1 });
  r = await call(admin, 'POST', '/admin/messages/preview', { audience: { roles: ['family'], country: 'se', city: 'stockholm' } });
  assert.deepEqual(r.body.sample.map((u) => u.id), [anna]);
  r = await call(admin, 'POST', '/admin/messages/preview', { audience: { people: 'maria@test.io\nnobody@test.io, demo@demo.pairmundo.com' } });
  assert.deepEqual([r.body.count, r.body.missing], [1, ['nobody@test.io', 'demo@demo.pairmundo.com']]);

  // Checks before sending.
  assert.equal((await call(admin, 'POST', '/admin/messages', { text: 'Hi', audience: { roles: ['family'] } })).status, 400);
  assert.equal((await call(admin, 'POST', '/admin/messages', { text: 'Hello everyone there', email: true, audience: { roles: ['family'] } })).status, 400, 'email needs a subject');
  assert.equal((await call(admin, 'POST', '/admin/messages', { text: 'Hello everyone there', link: 'javascript:alert(1)', audience: { roles: ['family'] } })).status, 400);
  assert.equal((await call(admin, 'POST', '/admin/messages', { text: 'Hello everyone there', audience: { roles: ['family'], country: 'JP' } })).status, 400);

  // A test goes to the admin only.
  r = await call(admin, 'POST', '/admin/messages/test', { text: 'Hi {name}, test message', subject: 'Test', email: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(outbox.at(-1).to, 'admin@test.io');

  // Bo turned news emails off in his account; he still gets it in the app.
  const boToken = await login('bo@test.io');
  await call(boToken, 'PUT', '/me', { news_emails: false });
  assert.equal((await call(boToken, 'GET', '/me')).body.user.news_emails, false);
  outbox.length = 0; pushed.length = 0;
  db.prepare("INSERT INTO push_tokens (user_id, token) VALUES (?, 'ExponentPushToken[annaphone123]')").run(anna);
  r = await call(admin, 'POST', '/admin/messages', { text: 'Hi {name}! 🎄 Spot our ads this Christmas.', subject: 'Christmas challenge', email: true, link: '#/discover',
    audience: { roles: ['family'], country: 'SE' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.sent, r.body.emailing, r.body.opted_out], [3, 2, 1]);
  await wait(() => outbox.length >= 1 && db.prepare("SELECT COUNT(*) n FROM admin_message_recipients WHERE email_status = 'pending'").get().n <= 1);
  assert.deepEqual(outbox.map((m) => m.to), ['anna@test.io'], 'Bo unsubscribed; the failing mailbox stops the batch');
  assert.match(outbox[0].text, /^Hi Anna! 🎄/);
  assert.match(outbox[0].text, /\/api\/news\/unsubscribe\?t=/);
  assert.ok(outbox[0].html.includes('/media/email/') && outbox[0].html.includes('#/discover'), 'designed email with a picture and a button');
  assert.ok(pushed.some((p) => p.to.includes('annaphone') && p.body.startsWith('Hi Anna!')));

  // Everyone in the group sees it in the bell and as a card until they close it.
  const annaToken = await login('anna@test.io');
  assert.ok((await call(annaToken, 'GET', '/notifications')).body.notifications.some((n) => n.kind === 'news' && n.text.startsWith('Hi Anna!')));
  let news = (await call(boToken, 'GET', '/news')).body.news;
  assert.deepEqual([news.title, news.text, news.link], ['Christmas challenge', 'Hi Bo! 🎄 Spot our ads this Christmas.', '#/discover']);
  await call(boToken, 'POST', `/news/${news.id}/seen`);
  assert.equal((await call(boToken, 'GET', '/news')).body.news, null);
  assert.equal((await call(await login('maria@test.io'), 'GET', '/news')).body.news, null, 'au pairs were not picked');

  // The history shows who got it; the failed email waits for "Email the rest".
  const h = (await call(admin, 'GET', '/admin/messages')).body;
  assert.deepEqual([h.history[0].sent, h.history[0].seen, h.history[0].emailed, h.history[0].email_pending], [3, 1, 1, 1]);
  assert.match(h.job.error, /Daily limit/);

  // Unsubscribing from the email link turns news emails off.
  const t = outbox[0].text.match(/unsubscribe\?t=([\w-]+)/)[1];
  const page = await fetch(`${base}/news/unsubscribe?t=${t}`);
  assert.match(await page.text(), /unsubscribed/);
  assert.equal(db.prepare('SELECT news_emails FROM users WHERE id = ?').get(anna).news_emails, 0);

  // One person by email.
  r = await call(admin, 'POST', '/admin/messages', { text: 'Hi {name}, your profile looks great!', audience: { people: 'maria@test.io' } });
  assert.equal(r.body.sent, 1);
  assert.equal((await call(await login('maria@test.io'), 'GET', '/news')).body.news.text, 'Hi Maria, your profile looks great!');
  assert.ok(!db.prepare('SELECT 1 FROM admin_message_recipients WHERE user_id IN (?, ?) AND message_id = ?').get(bo, fail, r.body.id));
});
