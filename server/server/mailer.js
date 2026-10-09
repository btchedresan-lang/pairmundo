// Sends account emails (verification and password-reset codes).
// With RESEND_API_KEY and MAIL_FROM set it sends through Resend (resend.com); otherwise it prints the email
// to the server console, which is enough for local testing.

import { t } from './i18n.js';

const APP_NAME = process.env.APP_NAME || 'PairMundo';

export function createMailer() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    return async ({ to, subject, text }) => {
      console.log(`\n--- Email to ${to} (not sent: set RESEND_API_KEY and MAIL_FROM to send real email) ---\n${subject}\n\n${text}\n---\n`);
    };
  }
  return async ({ to, subject, text }) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
  };
}

/** The "you're on the list" email, with a link to leave the list. */
export const waitlistEmail = (lang, leaveUrl) => {
  const v = { app: APP_NAME, link: leaveUrl };
  return { subject: t(lang, "You're on the {app} list", v),
    text: t(lang, "Thanks for your interest in {app}!\n\nWe'll email you when the iPhone and Android apps are ready. Until then you can already sign up and start matching at https://pairmundo.com.\n\nTo leave the list, open this link: {link}", v) };
};

/** Asks someone an au pair named to confirm what they know about them. */
export const referenceEmail = (lang, { aupair, referee, link }) => {
  const v = { app: APP_NAME, aupair, referee, link };
  return { subject: t(lang, '{aupair} asked you for a reference on {app}', v),
    text: t(lang, "Hi {referee},\n\n{aupair} is looking for a host family on {app}, an app where au pairs and host families find each other, and named you as a reference.\n\nCould you answer five short questions about the time {aupair} looked after children for you? It takes about two minutes:\n{link}\n\nFamilies on {app} will see your answers and your first name, never your email.\n\nIf you don't know {aupair}, you can ignore this email or say so on the page.", v) };
};

/** The code email in the person's language (see i18n.js). */
export const codeEmail = (purpose, code, lang) => {
  const v = { app: APP_NAME, code };
  return purpose === 'verify'
    ? { subject: t(lang, 'Your {app} code: {code}', v), text: t(lang, "Welcome to {app}!\n\nYour confirmation code is {code}. Enter it in the app to confirm your email. It expires in 30 minutes.\n\nIf you didn't sign up, you can ignore this email.", v) }
    : { subject: t(lang, 'Reset your {app} password', v), text: t(lang, "Your password reset code is {code}. Enter it in the app with your new password. It expires in 30 minutes.\n\nIf you didn't ask to reset your password, you can ignore this email; your password stays the same.", v) };
};
