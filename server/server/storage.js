// Where profile photos are kept.
// With S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_URL set, photos go to
// S3-compatible storage (Cloudflare R2, AWS S3, Backblaze B2...). Otherwise they are saved on this server's
// disk under UPLOAD_DIR and served at /uploads, which is enough for local testing.
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function createStorage({ dir }) {
  const { S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL, S3_REGION } = process.env;
  const disk = {
    kind: 'disk',
    owns: (url) => url.startsWith('/uploads/'),
    async save(name, buf) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), buf);
      return `/uploads/${name}`;
    },
    async remove(url) {
      if (!disk.owns(url)) return;
      try { unlinkSync(join(dir, url.slice('/uploads/'.length))); } catch { /* already gone */ }
    },
  };
  if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_PUBLIC_URL) return disk;

  const publicBase = S3_PUBLIC_URL.replace(/\/$/, '') + '/';
  // Photos saved on disk before storage was switched on stay readable, and can still be removed.
  const owns = (url) => url.startsWith(publicBase) || disk.owns(url);
  let client;
  const getClient = async () => {
    if (!client) {
      const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      client = { PutObjectCommand, DeleteObjectCommand, s3: new S3Client({
        region: S3_REGION || 'auto', endpoint: S3_ENDPOINT,
        credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
      }) };
    }
    return client;
  };
  return {
    kind: 's3',
    owns,
    async save(name, buf, type) {
      const { s3, PutObjectCommand } = await getClient();
      const key = `photos/${name}`;
      await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buf, ContentType: type, CacheControl: 'public, max-age=604800' }));
      return publicBase + key;
    },
    async remove(url) {
      if (disk.owns(url)) return disk.remove(url);
      if (!owns(url)) return;
      const { s3, DeleteObjectCommand } = await getClient();
      try { await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: url.slice(publicBase.length) })); }
      catch (e) { console.error('Photo delete failed:', e.message); }
    },
  };
}
