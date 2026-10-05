import { openDb } from './db.js';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';

const db = openDb();

// On a fresh live database, create the first admin from ADMIN_EMAIL and ADMIN_PASSWORD (only if that email has no account yet).
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD && !db.prepare('SELECT 1 FROM users WHERE email = ?').get(ADMIN_EMAIL)) {
  if (ADMIN_PASSWORD.length < 12) console.error('ADMIN_PASSWORD must be at least 12 characters; no admin account was created.');
  else {
    db.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES (?, ?, 'admin', 'Admin', 1)").run(ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD));
    console.log(`Created admin account ${ADMIN_EMAIL}`);
  }
}

const port = Number(process.env.PORT || 3000);
createApp(db).listen(port, () => console.log(`PairMundo running on http://localhost:${port}`));
