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
export const waitlistEmail = (lang, leaveUrl, earlyDays = 0, signupUrl = 'https://pairmundo.com') => {
  const v = { app: APP_NAME, link: leaveUrl, days: earlyDays, signup: signupUrl };
  const body = t(lang, "Thanks for your interest in {app}!\n\nWe'll email you when the iPhone and Android apps are ready. Until then you can already sign up and start matching on the website. This link opens the sign-up page with your email filled in: {signup}\n\nTo leave the list, open this link: {link}", v);
  // A family who got an early family bonus spot hears about it just before the leave link.
  const at = body.lastIndexOf('\n\n');
  const early = t(lang, 'Your family is one of the first to join, so you get {days} extra free days of the Family Pass on top of the free trial. Sign up with this email address and use them whenever it suits you.', v);
  return { subject: t(lang, "You're on the {app} list", v), text: earlyDays ? `${body.slice(0, at)}\n\n${early}${body.slice(at)}` : body };
};

/**
 * Before launch: tells a family on the waitlist, who has no account yet, that they can make their profile on the
 * website now (kind 'invite'), or reminds them once (kind 'reminder'). earlyDays mentions the free days they saved.
 */
export const profileInviteEmail = (lang, { kind, email, signupUrl, leaveUrl, earlyDays = 0 }) => {
  const v = { app: APP_NAME, email, link: signupUrl, days: earlyDays };
  const parts = kind === 'reminder'
    ? [t(lang, 'Hi!\n\nA quick reminder: your family can already make its {app} profile on the website. Sign up with this email address ({email}) here: {link}', v),
      t(lang, 'Add a photo and a few lines about your family, and au pairs can start liking you.', v)]
    : [t(lang, "Hi!\n\nThanks for joining the {app} list. You don't have to wait for the apps: your family can make its profile on the website today, and au pairs are joining now.", v),
      t(lang, "It takes about 5 minutes:\n1. Open this link. It opens the sign-up page with your email ({email}) filled in: {link}\n2. Choose a password and create your account.\n3. Enter the 6-digit code we email you, to confirm your email.\n4. Add a photo of your family and a few lines about the help you're looking for.", v),
      t(lang, 'Au pairs can only like families who have a photo and a few words, so the sooner your profile is there, the sooner they can find you.', v)];
  if (earlyDays) parts.push(t(lang, 'Your {days} extra free days of the Family Pass are already saved to this email address. Use them whenever it suits you.', v));
  parts.push(t(lang, 'See you on {app},\nThe {app} team', v));
  parts.push(t(lang, 'You got this email because you joined the {app} list. To leave the list, open this link: {link}', { ...v, link: leaveUrl }));
  return { subject: t(lang, kind === 'reminder' ? 'Your family profile is waiting' : 'Your family profile on {app} is open', v), text: parts.join('\n\n') };
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

/** Tells a partner agency about someone who asked for its help and agreed to share their details. Agencies get it in English. */
export const agencyLeadEmail = (l) => ({
  subject: `New ${APP_NAME} referral: ${l.name} (${l.code})`,
  text: [`Hello ${l.agency},`, '',
    `${l.name} asked for your help through ${APP_NAME} and agreed to share these details with you:`, '',
    `Name: ${l.name}`, `Email: ${l.email}`, `${l.role === 'family' ? 'Host family' : 'Au pair'}${l.lives_in ? `, living in ${l.lives_in}` : ''}`,
    l.nationality ? `Nationality: ${l.nationality}` : null, l.host_country ? `Au pair stay in: ${l.host_country}` : null, l.dates ? `Dates: ${l.dates}` : null,
    `Referral code: ${l.code}`, '',
    `Please contact them directly, and quote the referral code when you tell us who started their au pair year.`, '', `The ${APP_NAME} team`,
  ].filter((x) => x != null).join('\n'),
});

/** Invites a partner agency or an ambassador to create the account that shows their code's numbers. In English, like agencyLeadEmail. */
export const ambassadorInviteEmail = ({ kind, name, code, link, signup, email }) => (kind === 'distributor' ? {
  subject: `Your ${APP_NAME} flyer delivery page`,
  text: [`Hello ${name},`, '',
    `Thanks for delivering ${APP_NAME} flyers. You have your own page where you can see each delivery, the families who joined through your flyers, what you've earned and what is still to be paid.`, '',
    'Create your account here to see it:', signup, '',
    `Sign up with this email address (${email}), then enter the 6-digit code we email you. Your page appears under "Your pay" as soon as the email is confirmed.`, '',
    `The ${APP_NAME} team`].join('\n'),
} : {
  subject: kind === 'agency' ? `Your ${APP_NAME} agency account (code ${code})` : `Your ${APP_NAME} ambassador code: ${code}`,
  text: [`Hello ${name},`, '',
    kind === 'agency'
      ? `We've set up the agency code ${code} for ${name} on ${APP_NAME}. Your au pairs type it when they create their free account, or use this link, which fills it in for them:`
      : `Your ${APP_NAME} ambassador code is ${code}. People type it when they sign up, or use this link, which fills it in for them:`,
    link, '',
    kind === 'agency'
      ? `Create your agency account here to see how many of your au pairs have joined, how many profiles families can see, and how many placements are agreed:`
      : `Create your ${APP_NAME} account here to see the people you bring and what you've earned:`,
    signup, '',
    `Sign up with this email address (${email}). Your account is linked to your code as soon as you confirm the email.`, '',
    `The ${APP_NAME} team`].join('\n'),
});
