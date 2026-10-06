// Text the server sends people outside the app screens: notifications (in-app and push) and account emails.
// Each person gets them in the language their app uses (saved from the Accept-Language header), else English.
// The app's own screens are translated in mobile/src/locales.

export const LANGS = ['en', 'es', 'fr', 'de', 'pt'];

/** The first supported language in an Accept-Language header such as "es-MX,es;q=0.9,en;q=0.8". */
export function pickLang(header) {
  for (const part of String(header || '').split(',')) {
    const code = part.trim().split(/[-_;]/)[0].toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return null;
}

const DICT = {
  "It's a match! {name} liked you back.": {
    es: '¡Es un match! A {name} también le gustas.', fr: "C'est un match ! {name} vous a aussi liké.",
    de: 'Es ist ein Match! {name} mag dich auch.', pt: 'Deu match! {name} também curtiu você.' },
  '{name} super liked you! ⭐': {
    es: '¡{name} te dio un súper like! ⭐', fr: '{name} vous a envoyé un super like ! ⭐',
    de: '{name} hat dir ein Super Like gegeben! ⭐', pt: '{name} te deu um super like! ⭐' },
  'Someone new liked you. See who in Likes.': {
    es: 'Le gustas a alguien nuevo. Descubre quién en Likes.', fr: "Quelqu'un de nouveau vous a liké. Découvrez qui dans Likes.",
    de: 'Jemand Neues mag dich. Sieh unter Likes nach, wer.', pt: 'Alguém novo curtiu você. Veja quem em Curtidas.' },
  '{name} is interested in matching with you.': {
    es: '{name} quiere hacer match contigo.', fr: '{name} aimerait matcher avec vous.',
    de: '{name} möchte mit dir matchen.', pt: '{name} quer dar match com você.' },
  '{name} proposed a placement. Review and confirm it.': {
    es: '{name} ha propuesto una estancia. Revísala y confírmala.', fr: '{name} a proposé un séjour. Vérifiez-le et confirmez-le.',
    de: '{name} hat einen Aufenthalt vorgeschlagen. Prüfe und bestätige ihn.', pt: '{name} propôs uma estadia. Revise e confirme.' },
  'Your placement is confirmed. Work through the checklist together.': {
    es: 'Tu estancia está confirmada. Completad juntos la lista de tareas.', fr: 'Votre séjour est confirmé. Suivez la liste de tâches ensemble.',
    de: 'Dein Aufenthalt ist bestätigt. Arbeitet die Checkliste gemeinsam ab.', pt: 'Sua estadia está confirmada. Façam a lista de tarefas juntos.' },
  'Your placement is now active.': {
    es: 'Tu estancia ya está activa.', fr: 'Votre séjour est maintenant en cours.', de: 'Dein Aufenthalt ist jetzt aktiv.', pt: 'Sua estadia agora está ativa.' },
  'Your placement is now completed.': {
    es: 'Tu estancia ha finalizado.', fr: 'Votre séjour est maintenant terminé.', de: 'Dein Aufenthalt ist jetzt abgeschlossen.', pt: 'Sua estadia foi concluída.' },
  'Your placement was cancelled.': {
    es: 'Tu estancia se ha cancelado.', fr: 'Votre séjour a été annulé.', de: 'Dein Aufenthalt wurde abgesagt.', pt: 'Sua estadia foi cancelada.' },
  'Your placement ended. Leave a review to help the community.': {
    es: 'Tu estancia ha terminado. Deja una reseña para ayudar a la comunidad.', fr: 'Votre séjour est terminé. Laissez un avis pour aider la communauté.',
    de: 'Dein Aufenthalt ist vorbei. Hinterlasse eine Bewertung, um der Community zu helfen.', pt: 'Sua estadia terminou. Deixe uma avaliação para ajudar a comunidade.' },
  '{name} left you a review. It appears once you review them too, or {days} days after the placement ends.': {
    es: '{name} te ha dejado una reseña. Se mostrará cuando tú también le valores, o {days} días después de que termine la estancia.',
    fr: "{name} vous a laissé un avis. Il s'affichera quand vous l'aurez évalué à votre tour, ou {days} jours après la fin du séjour.",
    de: '{name} hat dich bewertet. Die Bewertung erscheint, sobald du auch bewertest, oder {days} Tage nach Ende des Aufenthalts.',
    pt: '{name} deixou uma avaliação para você. Ela aparece quando você também avaliar, ou {days} dias após o fim da estadia.' },
  'Your profile has a new verification badge.': {
    es: 'Tu perfil tiene una nueva insignia de verificación.', fr: 'Votre profil a un nouveau badge de vérification.',
    de: 'Dein Profil hat ein neues Verifizierungsabzeichen.', pt: 'Seu perfil ganhou um novo selo de verificação.' },
  'Your {app} code: {code}': {
    es: 'Tu código de {app}: {code}', fr: 'Votre code {app} : {code}', de: 'Dein {app}-Code: {code}', pt: 'Seu código do {app}: {code}' },
  "Welcome to {app}!\n\nYour confirmation code is {code}. Enter it in the app to confirm your email. It expires in 30 minutes.\n\nIf you didn't sign up, you can ignore this email.": {
    es: '¡Bienvenido/a a {app}!\n\nTu código de confirmación es {code}. Introdúcelo en la app para confirmar tu correo. Caduca en 30 minutos.\n\nSi no te has registrado, puedes ignorar este correo.',
    fr: "Bienvenue sur {app} !\n\nVotre code de confirmation est {code}. Saisissez-le dans l'app pour confirmer votre e-mail. Il expire dans 30 minutes.\n\nSi vous ne vous êtes pas inscrit, ignorez cet e-mail.",
    de: 'Willkommen bei {app}!\n\nDein Bestätigungscode ist {code}. Gib ihn in der App ein, um deine E-Mail-Adresse zu bestätigen. Er läuft in 30 Minuten ab.\n\nWenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.',
    pt: 'Boas-vindas ao {app}!\n\nSeu código de confirmação é {code}. Digite-o no app para confirmar seu e-mail. Ele expira em 30 minutos.\n\nSe você não se cadastrou, pode ignorar este e-mail.' },
  'Reset your {app} password': {
    es: 'Restablece tu contraseña de {app}', fr: 'Réinitialisez votre mot de passe {app}', de: 'Setze dein {app}-Passwort zurück', pt: 'Redefina sua senha do {app}' },
  "Your password reset code is {code}. Enter it in the app with your new password. It expires in 30 minutes.\n\nIf you didn't ask to reset your password, you can ignore this email; your password stays the same.": {
    es: 'Tu código para restablecer la contraseña es {code}. Introdúcelo en la app junto con tu nueva contraseña. Caduca en 30 minutos.\n\nSi no has pedido restablecer tu contraseña, ignora este correo; tu contraseña no cambiará.',
    fr: "Votre code de réinitialisation est {code}. Saisissez-le dans l'app avec votre nouveau mot de passe. Il expire dans 30 minutes.\n\nSi vous n'avez pas demandé à réinitialiser votre mot de passe, ignorez cet e-mail ; votre mot de passe reste inchangé.",
    de: 'Dein Code zum Zurücksetzen des Passworts ist {code}. Gib ihn in der App zusammen mit deinem neuen Passwort ein. Er läuft in 30 Minuten ab.\n\nWenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren; dein Passwort bleibt unverändert.',
    pt: 'Seu código para redefinir a senha é {code}. Digite-o no app com sua nova senha. Ele expira em 30 minutos.\n\nSe você não pediu para redefinir a senha, pode ignorar este e-mail; sua senha continua a mesma.' },
};

/** Translate English text into lang, filling {placeholders} from vars. */
export function t(lang, text, vars = {}) {
  const s = DICT[text]?.[lang] || text;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
