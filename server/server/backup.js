// Nightly copies of the database in a private S3-compatible bucket (Cloudflare R2), so accounts, matches and messages
// survive losing the server's disk. It stays off until BACKUP_BUCKET is set; it uses the same S3_ENDPOINT and keys as
// photo storage. BACKUP_BUCKET must be a different, private bucket: the photo bucket is public.
// A backup is a gzipped SQLite file at backups/pairmundo-YYYY-MM-DD.db.gz; the last BACKUP_KEEP_DAYS (30) are kept.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const PREFIX = 'backups/';
const HOUR = 60 * 60 * 1000;
/** UTC time as SQLite writes it (YYYY-MM-DD HH:MM:SS), like the rest of the API. */
const stamp = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

/** A consistent copy of the live database as a gzipped buffer (VACUUM INTO is safe while the app keeps writing). */
export function snapshot(db) {
  const dir = mkdtempSync(join(tmpdir(), 'pm-backup-'));
  try {
    const file = join(dir, 'copy.db');
    db.prepare('VACUUM INTO ?').run(file);
    return gzipSync(readFileSync(file));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function s3Client() {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: S3_REGION || 'auto', endpoint: S3_ENDPOINT, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
  return {
    put: (Bucket, Key, Body) => s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: 'application/gzip' })),
    list: async (Bucket) => {
      const keys = []; let ContinuationToken;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: PREFIX, ContinuationToken }));
        keys.push(...(r.Contents || []).map((o) => o.Key));
        ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return keys;
    },
    remove: (Bucket, keys) => s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } })),
  };
}

/**
 * Returns { enabled, status(), run() }. `client` is for tests; normally it is built from the S3_* settings.
 * Call start() to back up once a day (checked hourly, so a restart doesn't skip a day).
 */
export function createBackups(db, { client, now = () => new Date() } = {}) {
  const { BACKUP_BUCKET, S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 30;
  let problem = null;
  if (!BACKUP_BUCKET) problem = 'Backups are off: set BACKUP_BUCKET (see DEPLOY.md).';
  else if (BACKUP_BUCKET === S3_BUCKET) problem = 'Backups are off: BACKUP_BUCKET must be a private bucket, not the public photo bucket.';
  else if (!client && !(S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY)) problem = 'Backups are off: S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are needed too.';
  const state = { last: null, lastError: null, running: false };
  let getClient = client ? async () => client : null;
  if (!problem && !client) { let c; getClient = async () => (c ??= await s3Client()); }

  async function run() {
    if (problem) throw new Error(problem);
    if (state.running) throw new Error('A backup is already running.');
    state.running = true;
    try {
      const c = await getClient();
      const day = now().toISOString().slice(0, 10);
      const key = `${PREFIX}pairmundo-${day}.db.gz`;
      const body = snapshot(db);
      await c.put(BACKUP_BUCKET, key, body);
      // Keep the newest keepDays daily files (names sort by date).
      const old = (await c.list(BACKUP_BUCKET)).filter((k) => /pairmundo-\d{4}-\d{2}-\d{2}\.db\.gz$/.test(k)).sort().slice(0, -keepDays);
      if (old.length) await c.remove(BACKUP_BUCKET, old);
      state.last = { key, bytes: body.length, at: stamp(now()), removed: old.length };
      state.lastError = null;
      return state.last;
    } catch (e) {
      state.lastError = { message: e.message, at: stamp(now()) };
      throw e;
    } finally { state.running = false; }
  }

  return {
    enabled: !problem,
    status: () => ({ enabled: !problem, problem, bucket: problem ? null : BACKUP_BUCKET, keep_days: keepDays, last: state.last, last_error: state.lastError }),
    run,
    start() {
      if (problem) { console.log(problem); return; }
      const tick = () => {
        if (state.last?.at?.slice(0, 10) === now().toISOString().slice(0, 10)) return;
        run().then((r) => console.log(`Backup saved: ${r.key} (${Math.round(r.bytes / 1024)} KB)`))
          .catch((e) => console.error('Backup failed:', e.message));
      };
      setTimeout(tick, 60 * 1000).unref();
      setInterval(tick, HOUR).unref();
    },
  };
}
