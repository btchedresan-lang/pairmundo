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
export const waitlistEmail = (lang, leaveUrl, earlyDays = 0) => {
  const v = { app: APP_NAME, link: leaveUrl, days: earlyDays };
  const body = t(lang, "Thanks for your interest in {app}!\n\nWe'll email you when the iPhone and Android apps are ready. Until then you can already sign up and start matching at https://pairmundo.com.\n\nTo leave the list, open this link: {link}", v);
  // A family who got an early family bonus spot hears about it just before the leave link.
  const at = body.lastIndexOf('\n\n');
  const early = t(lang, 'Your family is one of the first to join, so you get {days} extra free days of the Family Pass on top of the free trial. Sign up with this email address and use them whenever it suits you.', v);
  return { subject: t(lang, "You're on the {app} list", v), text: earlyDays ? `${body.slice(0, at)}\n\n${early}${body.slice(at)}` : body };
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

/**
 * The "the apps are out" email for launch day. kind is 'account' (has a PairMundo account) or 'waitlist'.
 * earlyDays and useBy remind a family of the free days they saved by joining early.
 */
export const launchEmail = (lang, { kind, role, email, links, earlyDays = 0, useBy = null, leaveUrl = null }) => {
  const v = { app: APP_NAME, email, days: earlyDays, date: useBy, link: leaveUrl };
  const parts = [t(lang, 'Hi!\n\nThe {app} app is now in the app stores. Download it here:', v),
    links.map(([store, url]) => `${store}: ${url}`).join('\n')];
  parts.push(kind === 'account'
    ? t(lang, 'Sign in with the same email and password you use on {app}. Your profile, matches and messages are all there.', v)
    : t(lang, 'Sign up in the app with this email address ({email}).', v));
  if (role === 'aupair') parts.push(t(lang, '{app} is free for au pairs.', v));
  if (earlyDays) {
    parts.push([t(lang, 'Your family joined early, so you have {days} free days of the Family Pass saved.', v),
      t(lang, 'Open Family Pass in the app and tap "Use my {days} free days now" whenever it suits you.', v),
      useBy ? t(lang, 'You can use them until {date}.', v) : ''].filter(Boolean).join(' '));
  }
  parts.push(t(lang, 'See you in the app,\nThe {app} team', v));
  parts.push(kind === 'account' ? t(lang, 'You got this email because you have a {app} account.', v)
    : t(lang, 'You got this email because you joined the {app} list. To leave the list, open this link: {link}', v));
  return { subject: t(lang, 'The {app} app is here', v), text: parts.join('\n\n') };
};
