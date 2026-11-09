import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createSocial } from '../server/social.js';

// A stand-in for Apple's signing key, served as Apple's key list.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const fakeFetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const sign = (claims, { kid = 'k1', key = privateKey } = {}) => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc({ alg: 'RS256', kid })}.${enc(claims)}`;
  return `${body}.${createSign('RSA-SHA256').update(body).sign(key).toString('base64url')}`;
};
const appleClaims = (o = {}) => ({ iss: 'https://appleid.apple.com', aud: 'com.pairmundo.app', exp: Math.floor(Date.now() / 1000) + 600,
  sub: 'apple-1', email: 'new@privaterelay.appleid.com', email_verified: 'true', ...o });

test('social: Apple ID tokens are checked for signature, issuer, audience and expiry', async () => {
  const verify = createSocial({ fetchImpl: fakeFetch });
  assert.deepEqual(await verify('apple', sign(appleClaims())), { sub: 'apple-1', email: 'new@privaterelay.appleid.com', email_verified: true });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(verify('apple', sign(appleClaims(), { key: other })));
  await assert.rejects(verify('apple', sign(appleClaims({ aud: 'com.someone.else' }))));
  await assert.rejects(verify('apple', sign(appleClaims({ iss: 'https://evil.example' }))));
  await assert.rejects(verify('apple', sign(appleClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }))));
  await assert.rejects(verify('apple', 'not-a-token'));
  // Google stays off until its client IDs are set.
  delete process.env.GOOGLE_CLIENT_IDS;
  await assert.rejects(verify('google', sign({ ...appleClaims(), iss: 'https://accounts.google.com' })), /not set up/);
});

let server; let base; let db;
before(async () => {
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.UPLOAD_DIR = mkdtempSync(`${tmpdir()}/aupair-social-`);
  db = openDb(':memory:');
  const app = createApp(db, { mailer: async () => {}, pusher: async (msgs) => msgs.map(() => ({ status: 'ok' })), social: createSocial({ fetchImpl: fakeFetch }) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  server.app = app;
});
after(() => server.close());
const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

test('social: a new person picks family or au pair once, then signs straight in with a confirmed email', async () => {
  assert.deepEqual((await call(null, 'GET', '/auth/providers')).body.providers, ['apple']);
  const token = sign(appleClaims());
  const first = await call(null, 'POST', '/auth/social', { provider: 'apple', id_token: token });
  assert.equal(first.status, 200);
  assert.equal(first.body.needs_profile, true);
  const made = await call(null, 'POST', '/auth/social', { provider: 'apple', id_token: token, role: 'family', name: 'The Lund Family' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.user.email_verified, true);
  const me = (await call(made.body.token, 'GET', '/me')).body;
  assert.equal(me.user.role, 'family');
  // Next time Apple may leave out the email; the Apple ID alone finds the account.
  const again = await call(null, 'POST', '/auth/social', { provider: 'apple', id_token: sign(appleClaims({ email: undefined, email_verified: undefined })) });
  assert.equal(again.status, 200);
  assert.equal(again.body.user.id, made.body.user.id);
  // A bad token is refused.
  assert.equal((await call(null, 'POST', '/auth/social', { provider: 'apple', id_token: 'x.y.z' })).status, 400);
});

test('social: an existing email account is linked and its email confirmed', async () => {
  const r = await call(null, 'POST', '/auth/register', { email: 'maria@test.io', password: 'password123', role: 'aupair', name: 'Maria Test' });
  assert.equal(r.body.user.email_verified, false);
  const s = await call(null, 'POST', '/auth/social', { provider: 'apple', id_token: sign(appleClaims({ sub: 'apple-2', email: 'Maria@test.io' })) });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.user.id, r.body.user.id);
  assert.equal(s.body.user.email_verified, true);
});

test('new member alerts: someone waiting hears once a day when a new profile they could like joins', async () => {
  const fam = (await call(null, 'POST', '/auth/social', { provider: 'apple', id_token: sign(appleClaims()) })).body;
  assert.equal((await call(fam.token, 'PUT', '/me/new-member-alerts', { on: true })).status, 200);
  assert.equal((await call(fam.token, 'GET', '/me')).body.new_member_alert, true);
  db.prepare("UPDATE new_member_alerts SET since = datetime('now', '-1 hour')").run();
  const app = server.app;
  // Maria (above) has no photo or bio yet, so she wouldn't show in Discover: no alert.
  assert.equal(app.sendNewMemberAlerts(), 0);
  db.prepare("UPDATE users SET photos = '[\"/uploads/x.jpg\"]' WHERE email = 'maria@test.io'").run();
  db.prepare("UPDATE aupair_profiles SET bio = 'Hi!' WHERE user_id = (SELECT id FROM users WHERE email = 'maria@test.io')").run();
  assert.equal(app.sendNewMemberAlerts(), 1);
  const n = db.prepare("SELECT text FROM notifications WHERE user_id = ? AND kind = 'search'").all(fam.user.id);
  assert.match(n.at(-1).text, /new au pair/);
  // Not again within a day.
  assert.equal(app.sendNewMemberAlerts(), 0);
  assert.equal((await call(fam.token, 'PUT', '/me/new-member-alerts', { on: false })).status, 200);
  assert.equal((await call(fam.token, 'GET', '/me')).body.new_member_alert, false);
});
