import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from '../server/storage.js';

test('disk storage saves under /uploads and removes the file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pm-disk-'));
  const st = createStorage({ dir });
  const url = await st.save('a.jpg', Buffer.from('x'), 'image/jpeg');
  assert.equal(url, '/uploads/a.jpg');
  assert.ok(existsSync(join(dir, 'a.jpg')));
  await st.remove(url);
  assert.ok(!existsSync(join(dir, 'a.jpg')));
});

test('S3 storage uploads to the bucket and returns the public URL', async () => {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { seen.push({ method: req.method, url: req.url, type: req.headers['content-type'], auth: req.headers.authorization, body }); res.end(); });
  });
  await new Promise((r) => server.listen(0, r));
  const env = { S3_BUCKET: 'pics', S3_ENDPOINT: `http://127.0.0.1:${server.address().port}`, S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret', S3_PUBLIC_URL: 'https://photos.example.com/' };
  Object.assign(process.env, env);
  try {
    const st = createStorage({ dir: mkdtempSync(join(tmpdir(), 'pm-s3-')) });
    assert.equal(st.kind, 's3');
    const url = await st.save('u1-abc.png', Buffer.from('png!'), 'image/png');
    assert.equal(url, 'https://photos.example.com/photos/u1-abc.png');
    assert.ok(st.owns(url) && st.owns('/uploads/old.jpg') && !st.owns('https://elsewhere.com/x.png'));
    await st.remove(url);
    await st.remove('https://elsewhere.com/x.png'); // not ours: ignored
    const put = seen.find((s) => s.method === 'PUT');
    assert.ok(/\/photos\/u1-abc\.png/.test(put.url), put.url);
    assert.equal(put.type, 'image/png');
    assert.match(put.auth, /^AWS4-HMAC-SHA256 Credential=id\//);
    assert.ok(put.body.includes('png!'));
    assert.equal(seen.filter((s) => s.method === 'DELETE').length, 1);
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    server.close();
  }
});
