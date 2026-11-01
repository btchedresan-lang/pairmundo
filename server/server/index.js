import { openDb } from './db.js';
import { createApp, normEmail } from './app.js';
import { createBackups } from './backup.js';
import { hashPassword } from './auth.js';

const db = openDb();

// On a fresh live database, create the first admin from ADMIN_EMAIL and ADMIN_PASSWORD (only if that email has no account yet).
const ADMIN_EMAIL = normEmail(process.env.ADMIN_EMAIL);
const { ADMIN_PASSWORD } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD && !db.prepare('SELECT 1 FROM users WHERE lower(trim(email)) = ?').get(ADMIN_EMAIL)) {
  if (ADMIN_PASSWORD.length < 12) console.error('ADMIN_PASSWORD must be at least 12 characters; no admin account was created.');
  else {
    db.prepare("INSERT INTO users (email, password_hash, role, name, email_verified) VALUES (?, ?, 'admin', 'Admin', 1)").run(ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD));
    console.log(`Created admin account ${ADMIN_EMAIL}`);
  }
}

const port = Number(process.env.PORT || 3000);
const backups = createBackups(db);
backups.start();
const app = createApp(db, { backups });
// Family Pass expiry reminders, "time to look for your next au pair" nudges and "finish your profile" and "verify your ID" nudges: check every hour.
setInterval(() => {
  try { app.sendPassReminders(); } catch (e) { console.error('Pass reminders failed:', e.message); }
  try { app.sendSearchNudges(); } catch (e) { console.error('Search nudges failed:', e.message); }
  try { app.sendProfileNudges(); } catch (e) { console.error('Profile nudges failed:', e.message); }
  try { app.sendIdNudges(); } catch (e) { console.error('ID nudges failed:', e.message); }
}, 60 * 60 * 1000).unref();
app.listen(port, () => console.log(`PairMundo running on http://localhost:${port}`));
