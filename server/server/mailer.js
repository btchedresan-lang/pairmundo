// Sends account emails (verification and password-reset codes).
// With RESEND_API_KEY and MAIL_FROM set it sends through Resend (resend.com); otherwise it prints the email
// to the server console, which is enough for local testing.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { t } from './i18n.js';

const APP_NAME = process.env.APP_NAME || 'PairMundo';

export function createMailer() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    return async ({ to, subject, text, attachments }) => {
      console.log(`\n--- Email to ${to} (not sent: set RESEND_API_KEY and MAIL_FROM to send real email) ---\n${subject}\n\n${text}\n${(attachments || []).map((a) => `[attached: ${basename(a.path)}]\n`).join('')}---\n`);
    };
  }
  // attachments: [{ path }], files on this server, sent as base64.
  // html, when given, is the designed version; text stays as the plain version for mail apps that don't show HTML.
  return async ({ to, subject, text, html, attachments }) => {
    const files = (attachments || []).map((a) => ({ filename: a.filename || basename(a.path), content: readFileSync(a.path).toString('base64') }));
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}), ...(files.length ? { attachments: files } : {}) }),
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

/**
 * Turns a waitlist spot into a profile: a personal link that opens the person's profile, already started with what
 * they told us on the waitlist, to choose a password and finish it (kind 'invite', or 'reminder' with a fresh link).
 * role is 'family', 'aupair' or null (they didn't say; the page asks). Signed by Michael Lee, co-founder for community.
 */
export const accountInviteEmail = (lang, { kind, role, email, link, leaveUrl, linkDays, earlyDays = 0, assetBase = 'https://pairmundo.com' }) => {
  const v = { app: APP_NAME, email, link, days: linkDays, early: earlyDays };
  const parts = kind === 'reminder'
    ? [t(lang, "Hi!\n\nA quick reminder: the {app} profile we started for you when you joined the list is still waiting. It stays hidden until you finish it. Here is a fresh personal link: {link}", v)]
    : [t(lang, "Hi!\n\nThanks for joining the {app} list. You don't have to wait for the apps: we've started your profile with the details you gave us, so you only need a few minutes to finish it.", v),
      t(lang, 'Your profile is hidden. Nobody can see it or match with you until you finish it yourself.', v),
      t(lang, "To finish it:\n1. Open your personal link: {link}\n2. Add your name and choose a password. Opening the link confirms your email ({email}), so there's no code to type.\n3. Add a photo and a few lines about yourself.", v)];
  parts.push(role === 'aupair'
    ? t(lang, 'Families can only like au pairs with a photo and a few words, so the sooner your profile is done, the sooner they can find you.', v)
    : role === 'family'
      ? t(lang, 'Au pairs can only like families who have a photo and a few words, so the sooner your profile is there, the sooner they can find you.', v)
      : t(lang, "The link asks whether you're a host family or an au pair, then takes you to your profile.", v));
  if (earlyDays && role === 'family') parts.push(t(lang, 'Your {early} extra free days of the Family Pass are already saved to this profile. Use them whenever it suits you.', v));
  parts.push(t(lang, "The link is only for you, so please don't forward it. It works for {days} days. If you don't want a profile, ignore this email: nothing is shown, and we don't keep a profile you never finish.", v));
  parts.push(`${t(lang, 'Best,', v)}\nMichael Lee, Co-founder & Community, PairMundo`);
  parts.push(t(lang, 'You got this email because you joined the {app} list. To leave the list, open this link: {link}', { ...v, link: leaveUrl }));
  const subject = kind === 'reminder' ? t(lang, 'Your {app} profile is still waiting for you', v)
    : role === 'family' ? t(lang, 'Your family profile on {app} is ready to finish', v)
      : role === 'aupair' ? t(lang, 'Your au pair profile on {app} is ready to finish', v) : t(lang, 'Your {app} profile is ready to finish', v);
  const html = accountInviteHtml(lang, { kind, role, email, link, leaveUrl, linkDays, earlyDays, assetBase, subject });
  return { subject, text: parts.join('\n\n'), html };
};

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Translated text made safe for HTML, with line breaks kept. */
const th = (lang, text, vars) => esc(t(lang, text, vars)).replace(/\n/g, '<br>');

/**
 * The HTML version of accountInviteEmail: brand banner, the app on two phones, three steps, swipe / match / chat and
 * a big button. Built from tables with inline styles so it holds up in Gmail, Outlook and Apple Mail; pictures carry
 * no words (alt text says what they show), and every client that blocks images still gets the whole message.
 */
const accountInviteHtml = (lang, { kind, role, email, link, leaveUrl, linkDays, earlyDays, assetBase, subject }) => {
  const v = { app: APP_NAME, email, days: linkDays, early: earlyDays };
  const img = (f) => `${esc(assetBase.replace(/\/$/, ''))}/media/email/${f}`;
  const BLUE = '#3b5bdb'; const INK = '#2b2a33'; const MUTED = '#6b7286'; const SERIF = "Georgia, 'Times New Roman', serif";
  const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const reminder = kind === 'reminder';
  const headline = reminder ? t(lang, 'Your {app} profile is still waiting for you', v)
    : role === 'family' ? t(lang, 'Your au pair could be one swipe away', v)
      : role === 'aupair' ? t(lang, 'Your host family could be one swipe away', v) : t(lang, 'Your next adventure could be one swipe away', v);
  const sub = reminder ? t(lang, 'It stays hidden until you finish it. Here is a fresh personal link.', v)
    : t(lang, "We've started your profile with the details you gave us. Finish it in about 5 minutes and start matching.", v);
  const button = (bg, fg) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr><td align="center" bgcolor="${bg}" style="border-radius:999px">
      <a href="${esc(link)}" style="display:inline-block;padding:16px 34px;font:700 17px/1.2 ${SANS};color:${fg};text-decoration:none;border-radius:999px">${th(lang, 'Finish my profile', v)} &rarr;</a></td></tr></table>`;
  const step = (n, text) => `<tr><td width="44" valign="top" style="padding:0 0 14px"><div style="width:32px;height:32px;line-height:32px;border-radius:16px;background:#edf2ff;color:${BLUE};font:700 15px/32px ${SANS};text-align:center">${n}</div></td>
      <td valign="top" style="padding:5px 0 14px;font:16px/1.45 ${SANS};color:${INK}">${text}</td></tr>`;
  const feature = (emoji, title, text) => `<td width="33%" valign="top" style="padding:0 8px;text-align:center">
      <div style="font-size:26px;line-height:1">${emoji}</div><div style="font:600 17px/1.3 ${SERIF};color:${INK};padding:6px 0 4px">${th(lang, title, v)}</div>
      <div style="font:14px/1.45 ${SANS};color:${MUTED}">${th(lang, text, v)}</div></td>`;
  const nudge = role === 'aupair' ? 'Families can only like au pairs with a photo and a few words, so the sooner your profile is done, the sooner they can find you.'
    : role === 'family' ? 'Au pairs can only like families who have a photo and a few words, so the sooner your profile is there, the sooner they can find you.'
      : "The link asks whether you're a host family or an au pair, then takes you to your profile.";
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#edf1fd">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(sub)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#edf1fd"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
  <tr><td style="padding:0 4px 18px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td><img src="${img('icon.png')}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px"></td>
    <td style="padding-left:10px;font:600 24px/1 ${SERIF};color:${BLUE}">${esc(APP_NAME)}</td></tr></table></td></tr>

  <tr><td bgcolor="${BLUE}" style="background:${BLUE};background-image:linear-gradient(180deg,#3b5bdb,#4563e3);border-radius:24px 24px 0 0;padding:36px 32px 26px;text-align:center">
    <div style="display:inline-block;background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:6px 14px;font:600 13px/1.2 ${SANS};letter-spacing:.3px">${th(lang, reminder ? 'Your link is inside' : "You're one of the first 🎉", v)}</div>
    <h1 style="margin:16px 0 10px;font:600 34px/1.15 ${SERIF};color:#fff">${esc(headline)}</h1>
    <p style="margin:0 auto 24px;max-width:440px;font:17px/1.5 ${SANS};color:#e5eaff">${esc(sub)}</p>
    ${button('#ffffff', BLUE)}
  </td></tr>
  <tr><td bgcolor="#4563e3" style="background:#4563e3;border-radius:0 0 24px 24px;overflow:hidden;line-height:0">
    <img src="${img(role === 'aupair' ? 'hero-aupair.jpg' : 'hero-family.jpg')}" width="600" alt="${th(lang, 'The PairMundo app: profiles with a match score, and buttons to like or super like', v)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:0 0 24px 24px">
  </td></tr>

  <tr><td style="padding:22px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#fff;border-radius:20px">
    <tr><td style="padding:26px 28px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#ebfbee;border-radius:12px;padding:12px 14px;font:15px/1.45 ${SANS};color:#2b6a3a">🔒 ${th(lang, 'Your profile is hidden. Nobody can see it or match with you until you finish it yourself.', v)}</td></tr></table>
      <h2 style="margin:22px 0 14px;font:600 22px/1.2 ${SERIF};color:${INK}">${th(lang, '3 quick steps', v)}</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${step(1, th(lang, 'Tap the button.', v))}
        ${step(2, th(lang, 'Add your name and choose a password. No code to type.', v))}
        ${step(3, th(lang, 'Add a photo and a few lines about yourself.', v))}
      </table>
      <p style="margin:4px 0 0;font:15px/1.5 ${SANS};color:${MUTED}">${th(lang, nudge, v)}</p>
      ${earlyDays && role === 'family' ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td style="background:#fff4e6;border-radius:12px;padding:14px 16px;font:15px/1.45 ${SANS};color:#7a4a00">🎁 <strong>${th(lang, 'Your {early} extra free days of the Family Pass are already saved to this profile. Use them whenever it suits you.', v)}</strong></td></tr></table>` : ''}
    </td></tr>
    <tr><td style="padding:14px 0 0;line-height:0"><img src="${img('swipe-match-chat.jpg')}" width="600" alt="${th(lang, 'Swipe, match and chat in the PairMundo app', v)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
    <tr><td style="padding:20px 20px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${feature('🔥', 'Swipe', 'Browse profiles that fit you, each with a match score.')}
      ${feature('💚', 'Match', "Like each other and it's a match.")}
      ${feature('💬', 'Chat and video call', 'Get to know each other before you decide.')}
    </tr></table></td></tr>
    <tr><td style="padding:22px 28px 30px">${button(BLUE, '#ffffff')}</td></tr>
  </table></td></tr>

  <tr><td style="padding:22px 8px 0;font:15px/1.5 ${SANS};color:${INK}">${th(lang, 'Best,', v)}<br><strong>Michael Lee</strong><br><span style="color:${MUTED}">Co-founder &amp; Community, PairMundo</span></td></tr>
  <tr><td style="padding:22px 8px 0;font:13px/1.5 ${SANS};color:${MUTED}">
    ${th(lang, "The link is only for you, so please don't forward it. It works for {days} days. If you don't want a profile, ignore this email: nothing is shown, and we don't keep a profile you never finish.", v)}<br><br>
    ${th(lang, 'Button not working? Copy this link into your browser:', v)}<br><a href="${esc(link)}" style="color:${BLUE};word-break:break-all">${esc(link)}</a><br><br>
    ${esc(t(lang, 'You got this email because you joined the {app} list. To leave the list, open this link: {link}', { ...v, link: '\u0000' })).replace('\u0000', `<a href="${esc(leaveUrl)}" style="color:${MUTED}">${esc(leaveUrl)}</a>`)}
  </td></tr>
</table></td></tr></table></body></html>`;
};

/** Asks a family an au pair looked after children for to review them; answering takes a free account on that email. */
export const referenceEmail = (lang, { aupair, link }) => {
  const v = { app: APP_NAME, aupair, link };
  return { subject: t(lang, '{aupair} asked you to review them on {app}', v),
    text: t(lang, "Hello,\n\n{aupair} is looking for a new host family on {app}, an app where au pairs and host families find each other, and asked you to review the time they looked after your children.\n\nIt takes about two minutes. Open this link, make your free {app} account with this email address, and answer five short questions:\n{link}\n\nThe account shows families the review really comes from you. They will see your answers and your first name, never your email.\n\nIf you don't know {aupair}, you can ignore this email or say so on the page.", v) };
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

/** Invites a new partner manager to the partnerships pipeline. Their account exists; they set a password to sign in. */
export const teamInviteEmail = ({ name, email, link }) => ({
  subject: `Your ${APP_NAME} partnerships account`,
  text: [`Hello ${name},`, '',
    `You have a ${APP_NAME} account for running agency partnerships: the pipeline of agencies, your next steps each day, and your pay.`, '',
    'To sign in the first time, set your password here. Choose "Forgot password", enter this email address and use the code we send you:', link, '',
    `Your sign-in email: ${email}`, '',
    'Badji Tchedre-San, Co-founder & Partnerships, PairMundo'].join('\n'),
});

/** Tells an agency what's new on its agency page and asks it to invite its families and au pairs before the
 *  24 November launch (November 2026). In English, like the other partner emails; signed by Badji. */
export const agencyUpdateEmail = ({ name, link, code }) => ({
  subject: `Invite your families and au pairs to ${APP_NAME} now, so they're ready for launch on 24 November`,
  text: [`Hello ${name} team,`, '',
    `The ${APP_NAME} apps launch in the App Store and Google Play on 24 November. Android and the website are already open, and your agency page has new tools to get your families and au pairs ready before then.`, '',
    'Please invite them this week. Families and au pairs with a finished profile on launch day can start matching straight away.', '',
    'What you can do now:',
    '- Invite families and au pairs by email from your agency page. They get a link to a free account and join your agency when they sign up with that email. You see who has joined.',
    code ? `- Or share your link: ${link.split('/#')[0]}/?ref=${code}` : null,
    '- Choose who sees whom. By default everyone sees everyone. You can limit which au pairs your families see (nationality, age, languages, ID check, driving licence, childcare experience) and which families see your au pairs (host country, ID check, private room, non-smoking home, weekly hours). Your own families and au pairs always see each other.',
    '- Follow each of your families from new enquiry to placed, with private notes and whether your fee is paid.',
    '- Keep a record of every first match between your families and your au pairs.', '',
    "I've attached a one-page guide to the best way to set up au pair and family profiles. Feel free to forward it to them.", '',
    'We can also hide contact details in chats until you confirm a placement, let you approve each new family first, and include the Family Pass for your families. Just reply to this email if you want any of these.', '',
    'Open your agency page:', link, '',
    'Questions? Just reply to this email.', '',
    'Best regards,', 'Badji Tchedre-San', `Co-founder & Partnerships, ${APP_NAME}`].filter((x) => x != null).join('\n'),
});

/** An agency invites one of its host families to join it on PairMundo. In English, like ambassadorInviteEmail. */
export const agencyFamilyInviteEmail = ({ from, name, message, link, email, role = 'family' }) => ({
  subject: role === 'aupair' ? `${from} invites you to meet host families on ${APP_NAME}` : `${from} invites you to find your au pair on ${APP_NAME}`,
  text: [name ? `Hello ${name},` : 'Hello,', '',
    `${from} uses ${APP_NAME} to match host families with au pairs, and invites you to join.`, '',
    message ? `Their message:\n${message}\n` : null,
    role === 'aupair' ? 'Create your free au pair account here (au pairs never pay):' : 'Create your free family account here:', link, '',
    role === 'aupair'
      ? `Sign up with this email address (${email}) and you'll join ${from} automatically. Families will see that ${from} prepared you, and ${from} stays with you from the first chat to the start of your stay.`
      : `Sign up with this email address (${email}) and you'll join ${from} automatically. You'll see the au pairs ${from} works with, and ${from} stays with you from the first chat to the start of the stay.`, '',
    `The ${APP_NAME} team`].filter((x) => x != null).join('\n'),
});

/** An agency on PairMundo invites another agency to join and work with it. In English, like ambassadorInviteEmail. */
export const agencyNetworkInviteEmail = ({ from, name, message, signup, email }) => ({
  subject: `${from} invites ${name} to work together on ${APP_NAME}`,
  text: [`Hello ${name},`, '',
    `${from} works with au pairs and host families on ${APP_NAME} and would like to work with your agency there.`, '',
    message ? `Their message:\n${message}\n` : null,
    `Partner agencies on ${APP_NAME} share their spaces: your families can meet their au pairs and theirs can meet yours, and each placement you make together shows on both agencies' pages.`, '',
    'Create your free agency account here:', signup, '',
    `Sign up with this email address (${email}). Once your agency is set up, ${from}'s request is waiting for you to accept.`, '',
    `The ${APP_NAME} team`].filter((x) => x != null).join('\n'),
});
