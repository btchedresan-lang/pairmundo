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
  "{aupair} asked you for a reference on {app}": {
    es: "{aupair} te pidió una referencia en {app}", fr: "{aupair} vous demande une référence sur {app}", de: "{aupair} bittet dich auf {app} um eine Referenz", pt: "{aupair} pediu uma referência sua no {app}" },
  "Hi {referee},\n\n{aupair} is looking for a host family on {app}, an app where au pairs and host families find each other, and named you as a reference.\n\nCould you answer five short questions about the time {aupair} looked after children for you? It takes about two minutes:\n{link}\n\nFamilies on {app} will see your answers and your first name, never your email.\n\nIf you don't know {aupair}, you can ignore this email or say so on the page.": {
    es: "Hola, {referee}:\n\n{aupair} busca una familia de acogida en {app}, una app donde au pairs y familias de acogida se encuentran, y te ha indicado como referencia.\n\n¿Podrías responder cinco preguntas cortas sobre el tiempo en que {aupair} cuidó a tus hijos? Son unos dos minutos:\n{link}\n\nLas familias de {app} verán tus respuestas y tu nombre de pila, nunca tu email.\n\nSi no conoces a {aupair}, puedes ignorar este email o indicarlo en la página.", fr: "Bonjour {referee},\n\n{aupair} cherche une famille d'accueil sur {app}, une application où au pairs et familles d'accueil se trouvent, et vous a indiqué comme référence.\n\nPourriez-vous répondre à cinq courtes questions sur la période où {aupair} a gardé vos enfants ? Cela prend environ deux minutes :\n{link}\n\nLes familles sur {app} verront vos réponses et votre prénom, jamais votre email.\n\nSi vous ne connaissez pas {aupair}, vous pouvez ignorer cet email ou le signaler sur la page.", de: "Hallo {referee},\n\n{aupair} sucht auf {app}, einer App, in der Au-pairs und Gastfamilien zueinanderfinden, eine Gastfamilie und hat dich als Referenz angegeben.\n\nKönntest du fünf kurze Fragen zu der Zeit beantworten, in der {aupair} deine Kinder betreut hat? Das dauert etwa zwei Minuten:\n{link}\n\nFamilien auf {app} sehen deine Antworten und deinen Vornamen, nie deine E-Mail.\n\nWenn du {aupair} nicht kennst, kannst du diese E-Mail ignorieren oder es auf der Seite angeben.", pt: "Olá, {referee}!\n\n{aupair} está procurando uma família anfitriã no {app}, um app onde au pairs e famílias anfitriãs se encontram, e indicou você como referência.\n\nVocê poderia responder cinco perguntas curtas sobre o tempo em que {aupair} cuidou das suas crianças? Leva uns dois minutos:\n{link}\n\nAs famílias no {app} verão suas respostas e seu primeiro nome, nunca seu email.\n\nSe você não conhece {aupair}, pode ignorar este email ou dizer isso na página." },
  "{name} confirmed your reference. Families can now see it on your profile.": {
    es: "{name} confirmó tu referencia. Las familias ya pueden verla en tu perfil.", fr: "{name} a confirmé ta référence. Les familles peuvent maintenant la voir sur ton profil.", de: "{name} hat deine Referenz bestätigt. Familien sehen sie jetzt auf deinem Profil.", pt: "{name} confirmou sua referência. As famílias já podem vê-la no seu perfil." },
  "You're on the {app} list": {
    es: 'Estás en la lista de {app}', fr: 'Vous êtes sur la liste {app}', de: 'Du stehst auf der {app}-Liste', pt: 'Você está na lista do {app}' },
  "Thanks for your interest in {app}!\n\nWe'll email you when the iPhone and Android apps are ready. Until then you can already sign up and start matching at https://pairmundo.com.\n\nTo leave the list, open this link: {link}": {
    es: '¡Gracias por tu interés en {app}!\n\nTe escribiremos cuando las apps para iPhone y Android estén listas. Mientras tanto, ya puedes registrarte y empezar a hacer match en https://pairmundo.com.\n\nPara salir de la lista, abre este enlace: {link}',
    fr: "Merci de votre intérêt pour {app} !\n\nNous vous écrirons quand les applications iPhone et Android seront prêtes. En attendant, vous pouvez déjà vous inscrire et commencer à matcher sur https://pairmundo.com.\n\nPour quitter la liste, ouvrez ce lien : {link}",
    de: 'Danke für dein Interesse an {app}!\n\nWir schreiben dir, sobald die Apps für iPhone und Android fertig sind. Bis dahin kannst du dich schon auf https://pairmundo.com anmelden und matchen.\n\nUm die Liste zu verlassen, öffne diesen Link: {link}',
    pt: 'Obrigado pelo seu interesse no {app}!\n\nVamos te avisar por e-mail quando os apps para iPhone e Android estiverem prontos. Enquanto isso, você já pode se cadastrar e começar a dar match em https://pairmundo.com.\n\nPara sair da lista, abra este link: {link}' },
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
  'Your Family Pass is active. You can now message au pairs and see who liked you.': {
    es: 'Tu Family Pass está activo. Ya puedes escribir a au pairs y ver a quién le gustas.', fr: 'Votre Family Pass est actif. Vous pouvez maintenant écrire aux au pairs et voir qui vous a liké.',
    de: 'Dein Family Pass ist aktiv. Du kannst jetzt Au-pairs schreiben und sehen, wer dich mag.', pt: 'Seu Family Pass está ativo. Agora você pode mandar mensagens para au pairs e ver quem curtiu você.' },
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
