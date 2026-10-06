import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { openDb } from '../server/db.js';
import { createBackups } from '../server/backup.js';

function fakeBucket(keys = []) {
  const objects = new Map(keys.map((k) => [k, Buffer.alloc(0)]));
  return {
    objects,
    put: async (bucket, key, body) => { assert.equal(bucket, 'pm-backups'); objects.set(key, body); },
    list: async () => [...objects.keys()],
    remove: async (bucket, ks) => ks.forEach((k) => objects.delete(k)),
  };
}

test('backups: a gzipped copy of the database that opens, and only the newest 30 days are kept', async () => {
  process.env.BACKUP_BUCKET = 'pm-backups'; process.env.S3_BUCKET = 'pm-photos';
  const db = openDb(':memory:');
  db.prepare("INSERT INTO waitlist (email, role, token) VALUES ('kept@test.io', 'family', 't1')").run();
  const day = (i) => new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
  const old = Array.from({ length: 32 }, (_, i) => `backups/pairmundo-${day(i)}.db.gz`);
  const bucket = fakeBucket([...old, 'backups/notes.txt']);
  const backups = createBackups(db, { client: bucket, now: () => new Date('2026-10-06T03:00:00Z') });
  assert.equal(backups.enabled, true);

  const r = await backups.run();
  assert.equal(r.key, 'backups/pairmundo-2026-10-06.db.gz');
  assert.equal(r.at, '2026-10-06 03:00:00');
  const daily = [...bucket.objects.keys()].filter((k) => k.endsWith('.db.gz'));
  assert.equal(daily.length, 30);
  assert.ok(!bucket.objects.has(old[0]) && bucket.objects.has('backups/notes.txt'), 'oldest go, other files stay');

  const file = join(mkdtempSync(join(tmpdir(), 'pm-restore-')), 'restored.db');
  writeFileSync(file, gunzipSync(bucket.objects.get(r.key)));
  const restored = openDb(file);
  assert.equal(restored.prepare('SELECT email FROM waitlist').get().email, 'kept@test.io');
  assert.equal(backups.status().last.key, r.key);
});

test('backups stay off without a bucket, and refuse the public photo bucket', () => {
  const db = openDb(':memory:');
  delete process.env.BACKUP_BUCKET;
  assert.equal(createBackups(db, { client: fakeBucket() }).enabled, false);
  process.env.BACKUP_BUCKET = 'pm-photos'; process.env.S3_BUCKET = 'pm-photos';
  const b = createBackups(db, { client: fakeBucket() });
  assert.equal(b.enabled, false);
  assert.match(b.status().problem, /private bucket/);
  delete process.env.BACKUP_BUCKET; delete process.env.S3_BUCKET;
});
