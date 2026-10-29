// Text the server sends people outside the app screens: notifications (in-app and push) and account emails.
// Each person gets them in the language their app uses (saved from the Accept-Language header), else English.
// The app's own screens are translated in mobile/src/locales.

import { readFileSync } from 'node:fs';

export const LANGS = ['en', 'es', 'fr', 'de', 'pt', 'sv'];

/** The first supported language in an Accept-Language header such as "es-MX,es;q=0.9,en;q=0.8". */
export function pickLang(header) {
  for (const part of String(header || '').split(',')) {
    const code = part.trim().split(/[-_;]/)[0].toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return null;
}

export const DICT = {
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
    es: '{name} ha propuesto una estancia. Revísala y confírmala.', fr: '{name} a proposé un placement. Vérifiez-le et confirmez-le.',
    de: '{name} hat eine Vermittlung vorgeschlagen. Prüfe und bestätige sie.', pt: '{name} propôs uma estadia. Revise e confirme.' },
  'Your placement is confirmed. Work through the checklist together.': {
    es: 'Tu estancia está confirmada. Completad juntos la lista de tareas.', fr: 'Votre placement est confirmé. Suivez la liste de tâches ensemble.',
    de: 'Eure Vermittlung ist bestätigt. Arbeitet die Checkliste gemeinsam ab.', pt: 'Sua estadia está confirmada. Façam a lista de tarefas juntos.' },
  'Your placement is now active.': {
    es: 'Tu estancia ya está activa.', fr: 'Votre placement est maintenant en cours.', de: 'Eure Vermittlung ist jetzt aktiv.', pt: 'Sua estadia agora está ativa.' },
  'Your placement is now completed.': {
    es: 'Tu estancia ha finalizado.', fr: 'Votre placement est maintenant terminé.', de: 'Eure Vermittlung ist jetzt abgeschlossen.', pt: 'Sua estadia foi concluída.' },
  'Your placement was cancelled.': {
    es: 'Tu estancia se ha cancelado.', fr: 'Votre placement a été annulé.', de: 'Eure Vermittlung wurde storniert.', pt: 'Sua estadia foi cancelada.' },
  'Your placement ended. Leave a review to help the community.': {
    es: 'Tu estancia ha terminado. Deja una reseña para ayudar a la comunidad.', fr: 'Votre placement est terminé. Laissez un avis pour aider la communauté.',
    de: 'Eure Vermittlung ist beendet. Hinterlasse eine Bewertung, um der Community zu helfen.', pt: 'Sua estadia terminou. Deixe uma avaliação para ajudar a comunidade.' },
  '{name} left you a review. It appears once you review them too, or {days} days after the placement ends.': {
    es: '{name} te ha dejado una reseña. Se mostrará cuando tú también le valores, o {days} días después de que termine la estancia.',
    fr: "{name} vous a laissé un avis. Il s'affichera quand vous l'aurez évalué à votre tour, ou {days} jours après la fin du placement.",
    de: '{name} hat dich bewertet. Die Bewertung erscheint, sobald du auch bewertest, oder {days} Tage nach Ende der Vermittlung.',
    pt: '{name} deixou uma avaliação para você. Ela aparece quando você também avaliar, ou {days} dias após o fim da estadia.' },
  'Your profile has a new verification badge.': {
    es: 'Tu perfil tiene una nueva insignia de verificación.', fr: 'Votre profil a un nouveau badge de vérification.',
    de: 'Dein Profil hat ein neues Verifizierungsabzeichen.', pt: 'Seu perfil ganhou um novo selo de verificação.' },
  "{aupair} asked you to review them on {app}": {
    es: "{aupair} te pidió una reseña en {app}", fr: "{aupair} vous demande un avis sur {app}", de: "{aupair} bittet dich auf {app} um eine Bewertung", pt: "{aupair} pediu sua avaliação no {app}" },
  "Hello,\n\n{aupair} is looking for a new host family on {app}, an app where au pairs and host families find each other, and asked you to review the time they looked after your children.\n\nIt takes about two minutes. Open this link, make your free {app} account with this email address, and answer five short questions:\n{link}\n\nThe account shows families the review really comes from you. They will see your answers and your first name, never your email.\n\nIf you don't know {aupair}, you can ignore this email or say so on the page.": {
    es: "Hola:\n\n{aupair} busca una nueva familia de acogida en {app}, una app donde au pairs y familias de acogida se encuentran, y te pide una reseña del tiempo en que cuidó a tus hijos.\n\nSon unos dos minutos. Abre este enlace, crea tu cuenta gratuita de {app} con esta dirección de email y responde cinco preguntas cortas:\n{link}\n\nLa cuenta muestra a las familias que la reseña viene realmente de ti. Verán tus respuestas y tu nombre de pila, nunca tu email.\n\nSi no conoces a {aupair}, puedes ignorar este email o indicarlo en la página.", fr: "Bonjour,\n\n{aupair} cherche une nouvelle famille d'accueil sur {app}, une application où au pairs et familles d'accueil se trouvent, et vous demande un avis sur la période où {aupair} a gardé vos enfants.\n\nCela prend environ deux minutes. Ouvrez ce lien, créez votre compte {app} gratuit avec cette adresse email et répondez à cinq courtes questions :\n{link}\n\nLe compte montre aux familles que l'avis vient vraiment de vous. Elles verront vos réponses et votre prénom, jamais votre email.\n\nSi vous ne connaissez pas {aupair}, vous pouvez ignorer cet email ou le signaler sur la page.", de: "Hallo,\n\n{aupair} sucht auf {app}, einer App, in der Au-pairs und Gastfamilien zueinanderfinden, eine neue Gastfamilie und bittet dich, die Zeit zu bewerten, in der {aupair} deine Kinder betreut hat.\n\nDas dauert etwa zwei Minuten. Öffne diesen Link, lege mit dieser E-Mail-Adresse dein kostenloses {app}-Konto an und beantworte fünf kurze Fragen:\n{link}\n\nDas Konto zeigt Familien, dass die Bewertung wirklich von dir kommt. Sie sehen deine Antworten und deinen Vornamen, nie deine E-Mail.\n\nWenn du {aupair} nicht kennst, kannst du diese E-Mail ignorieren oder es auf der Seite angeben.", pt: "Olá!\n\n{aupair} está procurando uma nova família anfitriã no {app}, um app onde au pairs e famílias anfitriãs se encontram, e pediu que você avalie o tempo em que cuidou das suas crianças.\n\nLeva uns dois minutos. Abra este link, crie sua conta gratuita no {app} com este endereço de email e responda cinco perguntas curtas:\n{link}\n\nA conta mostra às famílias que a avaliação vem mesmo de você. Elas verão suas respostas e seu primeiro nome, nunca seu email.\n\nSe você não conhece {aupair}, pode ignorar este email ou dizer isso na página." },
  "{name} confirmed your reference. Families can now see it on your profile.": {
    es: "{name} confirmó tu referencia. Las familias ya pueden verla en tu perfil.", fr: "{name} a confirmé ta référence. Les familles peuvent maintenant la voir sur ton profil.", de: "{name} hat deine Referenz bestätigt. Familien sehen sie jetzt auf deinem Profil.", pt: "{name} confirmou sua referência. As famílias já podem vê-la no seu perfil." },
  "You're on the {app} list": {
    es: 'Estás en la lista de {app}', fr: 'Vous êtes sur la liste {app}', de: 'Du stehst auf der {app}-Liste', pt: 'Você está na lista do {app}' },
  "Thanks for your interest in {app}!\n\nWe'll email you when the iPhone and Android apps are ready. Until then you can already sign up and start matching on the website. This link opens the sign-up page with your email filled in: {signup}\n\nTo leave the list, open this link: {link}": {
    es: "¡Gracias por tu interés en {app}!\n\nTe escribiremos cuando las apps para iPhone y Android estén listas. Mientras tanto, ya puedes registrarte y empezar a hacer match en la web. Este enlace abre la página de registro con tu email ya escrito: {signup}\n\nPara salir de la lista, abre este enlace: {link}",
    fr: "Merci de votre intérêt pour {app} !\n\nNous vous écrirons quand les applications iPhone et Android seront prêtes. En attendant, vous pouvez déjà vous inscrire et commencer à matcher sur le site. Ce lien ouvre la page d'inscription avec votre adresse e-mail déjà remplie : {signup}\n\nPour quitter la liste, ouvrez ce lien : {link}",
    de: "Danke für dein Interesse an {app}!\n\nWir schreiben dir, sobald die Apps für iPhone und Android fertig sind. Bis dahin kannst du dich schon auf der Website anmelden und matchen. Dieser Link öffnet die Registrierung mit deiner E-Mail-Adresse schon eingetragen: {signup}\n\nUm die Liste zu verlassen, öffne diesen Link: {link}",
    pt: "Obrigado pelo seu interesse no {app}!\n\nVamos te avisar por e-mail quando os apps para iPhone e Android estiverem prontos. Enquanto isso, você já pode se cadastrar e começar a dar match no site. Este link abre a página de cadastro com seu e-mail já preenchido: {signup}\n\nPara sair da lista, abra este link: {link}" },
  "You're off the list. We won't email you about the launch.": {
    es: 'Ya no estás en la lista. No te escribiremos sobre el lanzamiento.', fr: "Vous ne faites plus partie de la liste. Nous ne vous écrirons pas au sujet du lancement.",
    de: 'Du bist nicht mehr auf der Liste. Wir schreiben dir nicht zum Start.', pt: 'Você saiu da lista. Não vamos mandar e-mails sobre o lançamento.' },
  'This link was already used, or the address is not on the list.': {
    es: 'Este enlace ya se usó o la dirección no está en la lista.', fr: "Ce lien a déjà été utilisé, ou l'adresse ne figure pas sur la liste.",
    de: 'Dieser Link wurde schon benutzt, oder die Adresse steht nicht auf der Liste.', pt: 'Este link já foi usado ou o endereço não está na lista.' },
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

  'Your ID is verified. Your profile now shows the ID verified badge.': {
    es: 'Tu identidad está verificada. Tu perfil ya muestra la insignia de ID verificado.', fr: "Votre identité est vérifiée. Votre profil affiche maintenant le badge Identité vérifiée.",
    de: 'Deine Identität ist bestätigt. Dein Profil zeigt jetzt das Abzeichen „Identität verifiziert“.', pt: 'Sua identidade foi verificada. Seu perfil agora mostra o selo de identidade verificada.' },
  'Your Rematch Guarantee gave you {days} free days of the Family Pass to find your next au pair.': {
    es: 'Tu Garantía de Rematch te ha dado {days} días gratis del Family Pass para encontrar a tu próximo au pair.', fr: 'Votre Garantie Rematch vous offre {days} jours gratuits du Family Pass pour trouver votre prochain au pair.',
    de: 'Deine Rematch-Garantie schenkt dir {days} kostenlose Tage Family Pass, um dein nächstes Au-pair zu finden.', pt: 'Sua Garantia de Rematch deu a você {days} dias grátis do Family Pass para encontrar seu próximo au pair.' },
  'Your Family Pass is active. You can now message au pairs and see who liked you.': {
    es: 'Tu Family Pass está activo. Ya puedes escribir a au pairs y ver a quién le gustas.', fr: 'Votre Family Pass est actif. Vous pouvez maintenant écrire aux au pairs et voir qui vous a liké.',
    de: 'Dein Family Pass ist aktiv. Du kannst jetzt Au-pairs schreiben und sehen, wer dich mag.', pt: 'Seu Family Pass está ativo. Agora você pode mandar mensagens para au pairs e ver quem curtiu você.' },
  'Your Family Pass ends in {days} days. Renew it to keep messaging au pairs.': {
    es: 'Tu Family Pass termina en {days} días. Renuévalo para seguir escribiendo a au pairs.', fr: 'Votre Family Pass se termine dans {days} jours. Renouvelez-le pour continuer à écrire aux au pairs.',
    de: 'Dein Family Pass endet in {days} Tagen. Verlängere ihn, um Au-pairs weiter schreiben zu können.', pt: 'Seu Family Pass termina em {days} dias. Renove para continuar mandando mensagens para au pairs.' },
  'Your Family Pass ends within 24 hours. Renew it to keep messaging au pairs.': {
    es: 'Tu Family Pass termina en menos de 24 horas. Renuévalo para seguir escribiendo a au pairs.', fr: 'Votre Family Pass se termine dans moins de 24 heures. Renouvelez-le pour continuer à écrire aux au pairs.',
    de: 'Dein Family Pass endet in weniger als 24 Stunden. Verlängere ihn, um Au-pairs weiter schreiben zu können.', pt: 'Seu Family Pass termina em menos de 24 horas. Renove para continuar mandando mensagens para au pairs.' },
  'Your Family Pass has ended. Get a new one to keep messaging au pairs and see who liked you.': {
    es: 'Tu Family Pass ha terminado. Consigue uno nuevo para seguir escribiendo a au pairs y ver a quién le gustas.', fr: "Votre Family Pass est terminé. Prenez-en un nouveau pour continuer à écrire aux au pairs et voir qui vous a liké.",
    de: 'Dein Family Pass ist abgelaufen. Hol dir einen neuen, um Au-pairs weiter zu schreiben und zu sehen, wer dich mag.', pt: 'Seu Family Pass terminou. Adquira um novo para continuar mandando mensagens para au pairs e ver quem curtiu você.' },
  'Your Family Pass has ended. You still have {free} free days saved for signing up early. Use them whenever you are ready.': {
    es: 'Tu Family Pass ha terminado. Todavía tienes {free} días gratis guardados por registrarte pronto. Úsalos cuando quieras.', fr: "Votre Family Pass est terminé. Il vous reste {free} jours gratuits mis de côté pour votre inscription anticipée. Utilisez-les quand vous voulez.",
    de: 'Dein Family Pass ist abgelaufen. Du hast noch {free} Gratistage, weil du dich früh angemeldet hast. Löse sie ein, wann du willst.', pt: 'Seu Family Pass terminou. Você ainda tem {free} dias grátis guardados por ter se cadastrado cedo. Use quando quiser.' },
  'Your Family Pass has ended. You still have {free} free days saved, a gift from {from}. Use them whenever you are ready.': {
    es: 'Tu Family Pass ha terminado. Todavía tienes {free} días gratis guardados, un regalo de {from}. Úsalos cuando quieras.', fr: 'Votre Family Pass est terminé. Il vous reste {free} jours gratuits mis de côté, un cadeau de {from}. Utilisez-les quand vous voulez.',
    de: 'Dein Family Pass ist abgelaufen. Du hast noch {free} Gratistage, ein Geschenk von {from}. Löse sie ein, wann du willst.', pt: 'Seu Family Pass terminou. Você ainda tem {free} dias grátis guardados, um presente de {from}. Use quando quiser.' },
  'Your family is one of the first to join, so you get {days} extra free days of the Family Pass on top of the free trial. Sign up with this email address and use them whenever it suits you.': {
    es: 'Tu familia es de las primeras en unirse, así que recibes {days} días gratis extra del Family Pass además de la prueba gratuita. Regístrate con este correo y úsalos cuando te venga bien.',
    fr: "Votre famille fait partie des premières inscrites : vous recevez {days} jours gratuits de Family Pass en plus de l'essai gratuit. Inscrivez-vous avec cette adresse e-mail et utilisez-les quand cela vous convient.",
    de: 'Deine Familie ist eine der ersten, deshalb bekommst du zusätzlich zur kostenlosen Testphase {days} Gratistage Family Pass. Melde dich mit dieser E-Mail-Adresse an und löse sie ein, wann es dir passt.',
    pt: 'Sua família está entre as primeiras a entrar, então você ganha {days} dias grátis extras de Family Pass além do teste grátis. Cadastre-se com este e-mail e use quando for melhor para você.' },
  'Renew it in the app, or on the website: {link}': {
    es: 'Renuévalo en la app o en la web: {link}', fr: "Renouvelez-le dans l'app ou sur le site : {link}",
    de: 'Verlängere ihn in der App oder auf der Website: {link}', pt: 'Renove no app ou no site: {link}' },
  "{name}'s stay with you ends on {date}. Finding your next au pair usually takes about 3 months, so now is a good time to start looking.": {
    es: 'La estancia de {name} con vosotros termina el {date}. Encontrar a vuestro próximo au pair suele llevar unos 3 meses, así que es un buen momento para empezar a buscar.',
    fr: "Le séjour de {name} chez vous se termine le {date}. Trouver votre prochain au pair prend en général environ 3 mois : c'est le bon moment pour commencer à chercher.",
    de: 'Der Aufenthalt von {name} bei euch endet am {date}. Die Suche nach dem nächsten Au-pair dauert meist etwa 3 Monate, also ist jetzt ein guter Zeitpunkt, damit anzufangen.',
    pt: 'A estadia de {name} com vocês termina em {date}. Encontrar o próximo au pair costuma levar cerca de 3 meses, então agora é um bom momento para começar a procurar.' },
  'If your au pair year ends in the next few months, now is a good time to start looking for your next au pair. It usually takes about 3 months.': {
    es: 'Si vuestro año de au pair termina en los próximos meses, es un buen momento para empezar a buscar a vuestro próximo au pair. Suele llevar unos 3 meses.',
    fr: "Si votre année au pair se termine dans les prochains mois, c'est le bon moment pour chercher votre prochain au pair. Cela prend en général environ 3 mois.",
    de: 'Wenn euer Au-pair-Jahr in den nächsten Monaten endet, ist jetzt ein guter Zeitpunkt, nach dem nächsten Au-pair zu suchen. Das dauert meist etwa 3 Monate.',
    pt: 'Se o ano de au pair de vocês termina nos próximos meses, agora é um bom momento para começar a procurar o próximo au pair. Costuma levar cerca de 3 meses.' },
  'Time to find your next au pair': {
    es: 'Es hora de buscar a vuestro próximo au pair', fr: 'Il est temps de trouver votre prochain au pair', de: 'Zeit, euer nächstes Au-pair zu finden', pt: 'Hora de encontrar o próximo au pair' },
  'Start looking in the app, or on the website: {link}': {
    es: 'Empieza a buscar en la app o en la web: {link}', fr: "Commencez à chercher dans l'app ou sur le site : {link}",
    de: 'Fang in der App oder auf der Website an zu suchen: {link}', pt: 'Comece a procurar no app ou no site: {link}' },
  // Match reasons and warnings (matching.js)
  'Wants to go to {country}': { es: 'Quiere ir a {country}', fr: 'Destination souhaitée : {country}', de: 'Möchte nach {country}', pt: 'Quer ir para {country}' },
  "Destination is not in the au pair's preferred countries": {
    es: 'El destino no está entre los países preferidos del au pair', fr: "La destination ne fait pas partie des pays souhaités par l'au pair",
    de: 'Das Ziel gehört nicht zu den Wunschländern des Au-pairs', pt: 'O destino não está entre os países preferidos do au pair' },
  'Speaks {languages}': { es: 'Habla {languages}', fr: 'Parle {languages}', de: 'Spricht {languages}', pt: 'Fala {languages}' },
  'Missing required language: {languages}': {
    es: 'Falta un idioma requerido: {languages}', fr: 'Langue requise manquante : {languages}', de: 'Fehlende Pflichtsprache: {languages}', pt: 'Falta um idioma exigido: {languages}' },
  'Shares a home language': { es: 'Comparte un idioma de casa', fr: 'Parle une langue de la famille', de: 'Spricht eine Familiensprache', pt: 'Fala um idioma da família' },
  'Availability lines up with start date': {
    es: 'Su disponibilidad coincide con la fecha de inicio', fr: 'La disponibilité correspond à la date de début', de: 'Verfügbarkeit passt zum Startdatum', pt: 'A disponibilidade coincide com a data de início' },
  'Availability is far from the start date': {
    es: 'Su disponibilidad está lejos de la fecha de inicio', fr: 'La disponibilité est éloignée de la date de début', de: 'Verfügbarkeit liegt weit vom Startdatum entfernt', pt: 'A disponibilidade está longe da data de início' },
  "Experienced with these children's ages": {
    es: 'Tiene experiencia con niños de estas edades', fr: "A de l'expérience avec des enfants de cet âge", de: 'Erfahrung mit Kindern in diesem Alter', pt: 'Tem experiência com crianças dessas idades' },
  'Family has an infant; au pair lists no infant experience': {
    es: 'La familia tiene un bebé; el au pair no indica experiencia con bebés', fr: "La famille a un bébé ; l'au pair n'indique aucune expérience avec les bébés",
    de: 'Familie hat ein Baby; Au-pair gibt keine Erfahrung mit Babys an', pt: 'A família tem um bebê; o au pair não informa experiência com bebês' },
  "Has a driver's license": { es: 'Tiene carné de conducir', fr: 'A le permis de conduire', de: 'Hat einen Führerschein', pt: 'Tem carteira de motorista' },
  'Family needs a driver': { es: 'La familia necesita a alguien que conduzca', fr: 'La famille a besoin de quelqu’un qui conduit', de: 'Familie braucht jemanden mit Führerschein', pt: 'A família precisa de alguém que dirija' },
  'Family has pets': { es: 'La familia tiene mascotas', fr: 'La famille a des animaux', de: 'Familie hat Haustiere', pt: 'A família tem animais de estimação' },
  '{country} has no au pair route for this au pair': {
    es: '{country} no tiene vía de au pair para este au pair', fr: "{country} : aucune voie au pair pour cet au pair", de: '{country}: kein Au-pair-Weg für dieses Au-pair', pt: '{country} não tem via de au pair para este au pair' },
  '{country} only has an au pair route for EU/EEA citizens': {
    es: '{country} solo tiene vía de au pair para ciudadanos de la UE/EEE', fr: '{country} : voie au pair réservée aux citoyens UE/EEE',
    de: '{country}: Au-pair-Weg nur für EU/EWR-Bürger', pt: '{country} só tem via de au pair para cidadãos da UE/EEE' },
  "{country}'s au pair visas are currently stalled": {
    es: 'Los visados de au pair de {country} están paralizados', fr: '{country} : les visas au pair sont actuellement bloqués',
    de: '{country}: Au-pair-Visa sind derzeit ausgesetzt', pt: 'Os vistos de au pair de {country} estão parados no momento' },
  "Age {age} is outside {country}'s {min}-{max} range": {
    es: 'Con {age} años queda fuera del rango de {min} a {max} de {country}', fr: "{age} ans : hors de la tranche {min}-{max} ans de {country}",
    de: 'Alter {age} liegt außerhalb von {min}-{max} ({country})', pt: '{age} anos está fora da faixa de {min} a {max} de {country}' },
  // Placement checks (matching.js)
  'No program rules on file for this country; check local regulations.': {
    es: 'No tenemos normas para este país; consulta la normativa local.', fr: "Aucune règle enregistrée pour ce pays ; vérifiez la réglementation locale.",
    de: 'Für dieses Land sind keine Regeln hinterlegt; prüfe die örtlichen Vorschriften.', pt: 'Não temos regras para este país; confira a legislação local.' },
  '{country} currently has no au pair route.': {
    es: '{country} no tiene ahora vía de au pair.', fr: "{country} n'a actuellement aucune voie au pair.", de: '{country} hat derzeit keinen Au-pair-Weg.', pt: '{country} não tem via de au pair no momento.' },
  'This au pair is an EU/EEA citizen, so free movement applies.': {
    es: 'Este au pair es ciudadano de la UE/EEE, así que aplica la libre circulación.', fr: "Cet au pair est citoyen de l'UE/EEE : la libre circulation s'applique.",
    de: 'Dieses Au-pair ist EU/EWR-Bürger, daher gilt die Freizügigkeit.', pt: 'Este au pair é cidadão da UE/EEE, então vale a livre circulação.' },
  "{country}'s au pair visas are currently paused.": {
    es: 'Los visados de au pair de {country} están en pausa.', fr: '{country} : les visas au pair sont actuellement suspendus.',
    de: '{country}: Au-pair-Visa sind derzeit ausgesetzt.', pt: 'Os vistos de au pair de {country} estão suspensos no momento.' },
  'Au pair will be {age} at start; {country} requires {min}-{max}.': {
    es: 'El au pair tendrá {age} años al empezar; {country} exige de {min} a {max}.', fr: "L'au pair aura {age} ans au début ; {country} exige {min}-{max} ans.",
    de: 'Das Au-pair ist zu Beginn {age}; {country} verlangt {min}-{max}.', pt: 'O au pair terá {age} anos no início; {country} exige de {min} a {max}.' },
  '{hours} h/week exceeds the {max} h maximum.': {
    es: '{hours} h/semana supera el máximo de {max} h.', fr: '{hours} h/semaine dépasse le maximum de {max} h.', de: '{hours} Std./Woche überschreitet das Maximum von {max} Std.', pt: '{hours} h/semana passa do máximo de {max} h.' },
  'Pocket money {amount} {currency}/month is below the {min} {currency} minimum.': {
    es: 'El dinero de bolsillo de {amount} {currency}/mes está por debajo del mínimo de {min} {currency}.', fr: "L'argent de poche de {amount} {currency}/mois est inférieur au minimum de {min} {currency}.",
    de: 'Taschengeld von {amount} {currency}/Monat liegt unter dem Minimum von {min} {currency}.', pt: 'A mesada de {amount} {currency}/mês está abaixo do mínimo de {min} {currency}.' },
  'End date must be after start date.': {
    es: 'La fecha de fin debe ser posterior a la de inicio.', fr: 'La date de fin doit être après la date de début.', de: 'Das Enddatum muss nach dem Startdatum liegen.', pt: 'A data de término deve ser depois da data de início.' },
  'Duration of ~{months} months exceeds the {max}-month maximum.': {
    es: 'Una duración de ~{months} meses supera el máximo de {max} meses.', fr: 'Une durée de ~{months} mois dépasse le maximum de {max} mois.',
    de: 'Eine Dauer von ~{months} Monaten überschreitet das Maximum von {max} Monaten.', pt: 'A duração de ~{months} meses passa do máximo de {max} meses.' },
  'Duration of ~{months} months is below the usual {min}-month minimum.': {
    es: 'Una duración de ~{months} meses está por debajo del mínimo habitual de {min} meses.', fr: 'Une durée de ~{months} mois est inférieure au minimum habituel de {min} mois.',
    de: 'Eine Dauer von ~{months} Monaten liegt unter dem üblichen Minimum von {min} Monaten.', pt: 'A duração de ~{months} meses está abaixo do mínimo habitual de {min} meses.' },
  '{country} requires placement through a recognised agency/sponsor.': {
    es: '{country} exige tramitar la estancia con una agencia o patrocinador reconocido.', fr: '{country} exige un placement via une agence ou un sponsor reconnu.',
    de: '{country} verlangt die Vermittlung über eine anerkannte Agentur oder einen Sponsor.', pt: '{country} exige que a estadia seja feita por uma agência ou patrocinador reconhecido.' },
  '{name} started a video call. Tap to join.': {
    es: '{name} ha iniciado una videollamada. Toca para unirte.', fr: '{name} a lancé un appel vidéo. Touchez pour rejoindre.',
    de: '{name} hat einen Videoanruf gestartet. Tippe, um beizutreten.', pt: '{name} iniciou uma videochamada. Toque para entrar.' },
  '{name} changed the au pair agreement. Read it again and sign it.': {
    es: '{name} cambió el acuerdo de au pair. Léelo de nuevo y fírmalo.', fr: "{name} a modifié l'accord au pair. Relisez-le et signez-le.",
    de: '{name} hat die Au-pair-Vereinbarung geändert. Lies sie noch einmal und unterschreibe sie.', pt: '{name} alterou o acordo de au pair. Leia de novo e assine.' },
  '{name} signed the au pair agreement. Read it and sign it too.': {
    es: '{name} firmó el acuerdo de au pair. Léelo y fírmalo tú también.', fr: "{name} a signé l'accord au pair. Lisez-le et signez-le à votre tour.",
    de: '{name} hat die Au-pair-Vereinbarung unterschrieben. Lies sie und unterschreibe auch.', pt: '{name} assinou o acordo de au pair. Leia e assine também.' },
  'Your au pair agreement is signed by both of you.': {
    es: 'Los dos habéis firmado el acuerdo de au pair.', fr: "L'accord au pair est signé par vous deux.",
    de: 'Eure Au-pair-Vereinbarung ist von euch beiden unterschrieben.', pt: 'O acordo de au pair foi assinado por vocês dois.' },
  'PairMundo checked one of your certificates. It now shows a ✔ on your profile.': {
    es: 'PairMundo ha revisado uno de tus certificados. Ahora aparece con un ✔ en tu perfil.', fr: 'PairMundo a vérifié un de vos certificats. Il affiche maintenant un ✔ sur votre profil.',
    de: 'PairMundo hat eines deiner Zertifikate geprüft. Es zeigt jetzt ein ✔ in deinem Profil.', pt: 'A PairMundo verificou um dos seus certificados. Agora ele aparece com um ✔ no seu perfil.' },
  "We couldn't confirm one of your certificates. Open your profile to see why and send a clearer copy.": {
    es: 'No pudimos confirmar uno de tus certificados. Abre tu perfil para ver por qué y envía una copia más clara.', fr: "Nous n'avons pas pu confirmer un de vos certificats. Ouvrez votre profil pour voir pourquoi et envoyez une copie plus nette.",
    de: 'Wir konnten eines deiner Zertifikate nicht bestätigen. Öffne dein Profil, um den Grund zu sehen, und schick eine deutlichere Kopie.', pt: 'Não conseguimos confirmar um dos seus certificados. Abra seu perfil para ver o motivo e envie uma cópia mais nítida.' },
  // The launch-day email (mailer.js launchEmail).
  "The {app} app is here": {
    es: "Ya está aquí la app de {app}", fr: "L'application {app} est là",
    de: "Die {app}-App ist da", pt: "O app do {app} chegou" },
  "Hi!\n\nThe {app} app is now in the app stores. Download it here:": {
    es: "¡Hola!\n\nLa app de {app} ya está en las tiendas de apps. Descárgala aquí:", fr: "Bonjour !\n\nL'application {app} est maintenant disponible dans les stores. Téléchargez-la ici :",
    de: "Hallo!\n\nDie {app}-App ist jetzt in den App-Stores. Hier kannst du sie herunterladen:", pt: "Oi!\n\nO app do {app} já está nas lojas de apps. Baixe aqui:" },
  "Sign in with the same email and password you use on {app}. Your profile, matches and messages are all there.": {
    es: "Inicia sesión con el mismo email y la misma contraseña que usas en {app}. Tu perfil, tus matches y tus mensajes están ahí.", fr: "Connectez-vous avec l'e-mail et le mot de passe que vous utilisez sur {app}. Votre profil, vos matchs et vos messages y sont déjà.",
    de: "Melde dich mit derselben E-Mail-Adresse und demselben Passwort an, die du auf {app} benutzt. Dein Profil, deine Matches und Nachrichten sind alle da.", pt: "Entre com o mesmo e-mail e a mesma senha que você usa no {app}. Seu perfil, seus matches e suas mensagens estão todos lá." },
  "Sign up in the app with this email address ({email}).": {
    es: "Regístrate en la app con esta dirección de email ({email}).", fr: "Inscrivez-vous dans l'application avec cette adresse e-mail ({email}).",
    de: "Registriere dich in der App mit dieser E-Mail-Adresse ({email}).", pt: "Cadastre-se no app com este endereço de e-mail ({email})." },
  "{app} is free for au pairs.": {
    es: "{app} es gratis para au pairs.", fr: "{app} est gratuit pour les au pairs.",
    de: "{app} ist für Au-pairs kostenlos.", pt: "O {app} é grátis para au pairs." },
  "Your family joined early, so you have {days} free days of the Family Pass saved.": {
    es: "Tu familia se unió pronto, así que tienes {days} días gratis de Family Pass guardados.", fr: "Votre famille s'est inscrite tôt : vous avez {days} jours gratuits de Family Pass en réserve.",
    de: "Deine Familie war früh dabei, deshalb hast du {days} Gratistage des Family Pass gespart.", pt: "Sua família entrou cedo, então você tem {days} dias grátis de Family Pass guardados." },
  "Open Family Pass in the app and tap \"Use my {days} free days now\" whenever it suits you.": {
    es: "Abre Family Pass en la app y toca \"Usar mis {days} días gratis ahora\" cuando te venga bien.", fr: "Ouvrez Family Pass dans l'application et touchez « Utiliser mes {days} jours gratuits maintenant » quand cela vous convient.",
    de: "Öffne Family Pass in der App und tippe auf „Meine {days} Gratistage jetzt einlösen“, wann immer es dir passt.", pt: "Abra Family Pass no app e toque em \"Usar meus {days} dias grátis agora\" quando for melhor para você." },
  "You can use them until {date}.": {
    es: "Puedes usarlos hasta el {date}.", fr: "Vous pouvez les utiliser jusqu'au {date}.",
    de: "Du kannst sie bis zum {date} einlösen.", pt: "Você pode usá-los até {date}." },
  "See you in the app,\nThe {app} team": {
    es: "Nos vemos en la app,\nEl equipo de {app}", fr: "À bientôt dans l'application,\nL'équipe {app}",
    de: "Bis gleich in der App,\nDein {app}-Team", pt: "Até já no app,\nEquipe {app}" },
  "You got this email because you have a {app} account.": {
    es: "Recibes este email porque tienes una cuenta de {app}.", fr: "Vous recevez cet e-mail parce que vous avez un compte {app}.",
    de: "Du bekommst diese E-Mail, weil du ein {app}-Konto hast.", pt: "Você recebeu este e-mail porque tem uma conta no {app}." },
  "You got this email because you joined the {app} list. To leave the list, open this link: {link}": {
    es: "Recibes este email porque te uniste a la lista de {app}. Para salir de la lista, abre este enlace: {link}", fr: "Vous recevez cet e-mail parce que vous vous êtes inscrit à la liste {app}. Pour quitter la liste, ouvrez ce lien : {link}",
    de: "Du bekommst diese E-Mail, weil du dich auf die {app}-Liste gesetzt hast. Um die Liste zu verlassen, öffne diesen Link: {link}", pt: "Você recebeu este e-mail porque entrou na lista do {app}. Para sair da lista, abra este link: {link}" },
  "Your family profile on {app} is open": {
    es: "Ya puedes crear el perfil de tu familia en {app}", fr: "Le profil de votre famille sur {app} est ouvert",
    de: "Euer Familienprofil auf {app} ist offen", pt: "O perfil da sua família no {app} já está aberto" },
  "Hi!\n\nThanks for joining the {app} list. You don't have to wait for the apps: your family can make its profile on the website today, and au pairs are joining now.": {
    es: "¡Hola!\n\nGracias por unirte a la lista de {app}. No hace falta esperar a las apps: tu familia ya puede crear su perfil en la web, y los au pairs se están uniendo ahora.", fr: "Bonjour !\n\nMerci de vous être inscrit à la liste {app}. Inutile d'attendre les applications : votre famille peut créer son profil sur le site dès aujourd'hui, et des au pairs s'inscrivent en ce moment.",
    de: "Hallo!\n\nDanke, dass du dich auf die {app}-Liste gesetzt hast. Du musst nicht auf die Apps warten: Deine Familie kann ihr Profil schon heute auf der Website anlegen, und gerade melden sich Au-pairs an.", pt: "Olá!\n\nObrigado por entrar na lista do {app}. Não precisa esperar pelos apps: sua família já pode criar o perfil no site hoje, e au pairs estão entrando agora." },
  "It takes about 5 minutes:\n1. Open this link. It opens the sign-up page with your email ({email}) filled in: {link}\n2. Choose a password and create your account.\n3. Enter the 6-digit code we email you, to confirm your email.\n4. Add a photo of your family and a few lines about the help you're looking for.": {
    es: "Se tarda unos 5 minutos:\n1. Abre este enlace. Abre la página de registro con tu email ({email}) ya escrito: {link}\n2. Elige una contraseña y crea tu cuenta.\n3. Escribe el código de 6 cifras que te enviamos por email para confirmarlo.\n4. Añade una foto de tu familia y unas líneas sobre la ayuda que buscas.", fr: "Cela prend environ 5 minutes :\n1. Ouvrez ce lien. Il ouvre la page d'inscription avec votre adresse e-mail ({email}) déjà remplie : {link}\n2. Choisissez un mot de passe et créez votre compte.\n3. Saisissez le code à 6 chiffres que nous vous envoyons par e-mail pour le confirmer.\n4. Ajoutez une photo de votre famille et quelques lignes sur l'aide que vous cherchez.", de: "Das dauert etwa 5 Minuten:\n1. Öffne diesen Link. Er öffnet die Registrierung mit deiner E-Mail-Adresse ({email}) schon eingetragen: {link}\n2. Wähle ein Passwort und erstelle dein Konto.\n3. Gib den 6-stelligen Code ein, den wir dir per E-Mail schicken, um sie zu bestätigen.\n4. Füge ein Foto deiner Familie und ein paar Zeilen über die Hilfe hinzu, die du suchst.", pt: "Leva uns 5 minutos:\n1. Abra este link. Ele abre a página de cadastro com seu e-mail ({email}) já preenchido: {link}\n2. Escolha uma senha e crie sua conta.\n3. Digite o código de 6 dígitos que enviamos por e-mail para confirmá-lo.\n4. Adicione uma foto da sua família e algumas linhas sobre a ajuda que procura." },
  "Au pairs can only like families who have a photo and a few words, so the sooner your profile is there, the sooner they can find you.": {
    es: "Los au pairs solo pueden dar like a familias con foto y unas palabras, así que cuanto antes esté tu perfil, antes te encontrarán.", fr: "Les au pairs ne peuvent liker que les familles qui ont une photo et quelques mots : plus tôt votre profil est en ligne, plus tôt ils vous trouvent.",
    de: "Au-pairs können nur Familien mit Foto und ein paar Worten liken. Je früher dein Profil steht, desto früher finden sie dich.", pt: "Au pairs só podem curtir famílias que têm foto e algumas palavras, então quanto antes seu perfil estiver lá, antes eles encontram vocês." },
  "Your {days} extra free days of the Family Pass are already saved to this email address. Use them whenever it suits you.": {
    es: "Tus {days} días gratis extra de Family Pass ya están guardados en este email. Úsalos cuando te venga bien.", fr: "Vos {days} jours gratuits de Family Pass en plus sont déjà réservés à cette adresse e-mail. Utilisez-les quand cela vous convient.",
    de: "Deine {days} zusätzlichen Gratistage des Family Pass sind schon für diese E-Mail-Adresse gespeichert. Löse sie ein, wann es dir passt.", pt: "Seus {days} dias grátis extras de Family Pass já estão guardados neste e-mail. Use quando for melhor para você." },
  "See you on {app},\nThe {app} team": {
    es: "Nos vemos en {app},\nEl equipo de {app}", fr: "À bientôt sur {app},\nL'équipe {app}",
    de: "Bis bald auf {app},\nDein {app}-Team", pt: "Até já no {app},\nEquipe {app}" },
  "Your family profile is waiting": {
    es: "El perfil de tu familia te espera", fr: "Le profil de votre famille vous attend",
    de: "Euer Familienprofil wartet", pt: "O perfil da sua família está esperando" },
  "Hi!\n\nA quick reminder: your family can already make its {app} profile on the website. Sign up with this email address ({email}) here: {link}": {
    es: "¡Hola!\n\nUn recordatorio rápido: tu familia ya puede crear su perfil de {app} en la web. Regístrate con este email ({email}) aquí: {link}", fr: "Bonjour !\n\nPetit rappel : votre famille peut déjà créer son profil {app} sur le site. Inscrivez-vous avec cette adresse e-mail ({email}) ici : {link}",
    de: "Hallo!\n\nKurze Erinnerung: Deine Familie kann ihr {app}-Profil schon auf der Website anlegen. Registriere dich mit dieser E-Mail-Adresse ({email}) hier: {link}", pt: "Olá!\n\nUm lembrete rápido: sua família já pode criar o perfil no {app} pelo site. Cadastre-se com este e-mail ({email}) aqui: {link}" },
  "Add a photo and a few lines about your family, and au pairs can start liking you.": {
    es: "Añade una foto y unas líneas sobre tu familia, y los au pairs podrán empezar a darte like.", fr: "Ajoutez une photo et quelques lignes sur votre famille, et les au pairs pourront commencer à vous liker.",
    de: "Füge ein Foto und ein paar Zeilen über deine Familie hinzu, dann können Au-pairs dich liken.", pt: "Adicione uma foto e algumas linhas sobre sua família, e os au pairs já podem curtir vocês." },
  "Au pairs can only like families with a photo and a few words. Add yours to your profile; it takes about 5 minutes.": {
    es: "Los au pairs solo pueden dar like a familias con foto y unas palabras. Añade las tuyas a tu perfil; se tarda unos 5 minutos.", fr: "Les au pairs ne peuvent liker que les familles avec une photo et quelques mots. Ajoutez les vôtres à votre profil ; cela prend environ 5 minutes.",
    de: "Au-pairs können nur Familien mit Foto und ein paar Worten liken. Ergänze beides in deinem Profil; das dauert etwa 5 Minuten.", pt: "Au pairs só podem curtir famílias com foto e algumas palavras. Adicione as suas ao perfil; leva uns 5 minutos." },
  "Families can only like au pairs with a photo and a few words. Add yours to your profile; it takes about 5 minutes.": {
    es: "Las familias solo pueden dar like a au pairs con foto y unas palabras. Añade las tuyas a tu perfil; se tarda unos 5 minutos.", fr: "Les familles ne peuvent liker que les au pairs avec une photo et quelques mots. Ajoutez les vôtres à votre profil ; cela prend environ 5 minutes.",
    de: "Familien können nur Au-pairs mit Foto und ein paar Worten liken. Ergänze beides in deinem Profil; das dauert etwa 5 Minuten.", pt: "Famílias só podem curtir au pairs com foto e algumas palavras. Adicione as suas ao perfil; leva uns 5 minutos." },
  "Finish your profile here: {link}": {
    es: "Completa tu perfil aquí: {link}", fr: "Complétez votre profil ici : {link}",
    de: "Vervollständige dein Profil hier: {link}", pt: "Complete seu perfil aqui: {link}" },
};

// Swedish lives in its own file, keyed by the same English text.
const SV = JSON.parse(readFileSync(new URL('./locales/sv.json', import.meta.url), 'utf8'));
for (const [en, sv] of Object.entries(SV)) if (DICT[en]) DICT[en].sv = sv;

/** Translate English text into lang, filling {placeholders} from vars. */
export function t(lang, text, vars = {}) {
  const s = DICT[text]?.[lang] || text;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** A country's name in lang, e.g. countryName('de', 'US') is "Vereinigte Staaten". */
export function countryName(lang, code, fallback = code) {
  if (!lang || lang === 'en' || !code) return fallback;
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code) || fallback; } catch { return fallback; }
}
/** A language's name in lang ("en" in German is "Englisch"). */
export function languageName(lang, code) {
  try { return new Intl.DisplayNames([lang || 'en'], { type: 'language' }).of(code) || code; } catch { return code; }
}
