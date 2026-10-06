import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModerator } from '../server/moderation.js';

const fakeClient = (reply) => {
  const calls = [];
  return { calls, beta: { messages: { create: async (req) => { calls.push(req); if (reply instanceof Error) throw reply; return reply; } } } };
};
const jpeg = Buffer.from('ffd8ffe000104a464946', 'hex');

test('photo check: sends the image and reads the verdict', async () => {
  const client = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"verdict":"reject","category":"nudity","note":"Nude."}' }] });
  const check = createModerator({ client });
  assert.deepEqual(await check(jpeg, 'image/jpeg'), { verdict: 'reject', category: 'nudity', note: 'Nude.' });
  const req = client.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.deepEqual(req.messages[0].content[0].source, { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') });
});

test('photo check: a declined check goes to review, a failed one lets the photo through', async () => {
  assert.equal((await createModerator({ client: fakeClient({ stop_reason: 'refusal', content: [] }) })(jpeg, 'image/jpeg')).verdict, 'review');
  const failed = await createModerator({ client: fakeClient(new Error('network down')) })(jpeg, 'image/jpeg');
  assert.equal(failed.verdict, 'allow');
  assert.equal(failed.failed, true);
});

test('photo check is off without an API key', () => {
  const saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  assert.equal(createModerator(), null);
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
});
