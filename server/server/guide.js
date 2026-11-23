// The in-app guide: what to do next, for each kind of account.
//
// - Steps: a short checklist per role (au pair, host family, agency, Community Manager), each worked out from what the
//   person has really done (a like, a match, a message, a video call, a placement...), so it is never out of date.
// - Tour: a first-run walkthrough of a few slides, shown once on the website (and again from "Show me around").
// - Next-step card: the first open step, which the phone app shows at the top of Discover through /api/news when
//   there is no message from PairMundo. That works in the app already in the stores, with no new build.
//
// All text is here, in English and the five other languages, so the website and the app show the same words.

const LANGS = ['es', 'fr', 'de', 'pt', 'sv'];
// key: [en, es, fr, de, pt, sv]
const TEXT = {
  // ---------- steps: au pairs and families ----------
  email_t: ['Confirm your email', 'Confirma tu email', 'Confirmez votre email', 'Bestätige deine E-Mail', 'Confirme seu email', 'Bekräfta din e-post'],
  email_x: ['Enter the 6-digit code we emailed you. You need it to like people and send messages.',
    'Escribe el código de 6 cifras que te enviamos. Lo necesitas para dar likes y enviar mensajes.',
    'Saisissez le code à 6 chiffres reçu par email. Il est nécessaire pour liker et envoyer des messages.',
    'Gib den 6-stelligen Code aus unserer E-Mail ein. Du brauchst ihn, um Likes und Nachrichten zu senden.',
    'Digite o código de 6 dígitos que enviamos por email. Você precisa dele para curtir e enviar mensagens.',
    'Skriv in den 6-siffriga koden vi mejlade dig. Den behövs för att gilla och skicka meddelanden.'],
  email_c: ['Enter my code', 'Escribir mi código', 'Saisir mon code', 'Code eingeben', 'Digitar meu código', 'Skriv in koden'],
  profile_t: ['Add a photo and a few words', 'Añade una foto y unas palabras', 'Ajoutez une photo et quelques mots', 'Füge ein Foto und ein paar Worte hinzu', 'Adicione uma foto e algumas palavras', 'Lägg till ett foto och några ord'],
  profile_x_aupair: ['Families only see profiles with a photo and an About me. Clear, smiling photos get the most likes.',
    'Las familias solo ven perfiles con foto y un Sobre mí. Las fotos claras y sonrientes reciben más likes.',
    'Les familles ne voient que les profils avec une photo et une présentation. Les photos nettes et souriantes reçoivent le plus de likes.',
    'Familien sehen nur Profile mit Foto und „Über mich“. Klare Fotos mit einem Lächeln bekommen die meisten Likes.',
    'As famílias só veem perfis com foto e um Sobre mim. Fotos nítidas e sorridentes recebem mais curtidas.',
    'Familjer ser bara profiler med foto och en Om mig. Tydliga, glada foton får flest gillningar.'],
  profile_x_family: ['Au pairs only see families with a photo and a few words about you. A family photo and your home help.',
    'Los au pairs solo ven familias con foto y unas palabras. Una foto de familia y de tu casa ayudan.',
    'Les au pairs ne voient que les familles avec une photo et quelques mots. Une photo de famille et de la maison aident.',
    'Au-pairs sehen nur Familien mit Foto und ein paar Worten. Ein Familienfoto und Bilder vom Zuhause helfen.',
    'Os au pairs só veem famílias com foto e algumas palavras. Uma foto da família e da casa ajudam.',
    'Au pairer ser bara familjer med foto och några ord. Ett familjefoto och bilder på hemmet hjälper.'],
  profile_c: ['Edit my profile', 'Editar mi perfil', 'Modifier mon profil', 'Profil bearbeiten', 'Editar meu perfil', 'Redigera min profil'],
  id_t: ['Verify your ID', 'Verifica tu identidad', 'Vérifiez votre identité', 'Verifiziere deinen Ausweis', 'Verifique sua identidade', 'Verifiera ditt ID'],
  id_x: ['Scan your passport or ID card and take a selfie. The ✔ ID verified badge helps people trust you.',
    'Escanea tu pasaporte o DNI y hazte un selfie. La insignia ✔ ID verificado genera confianza.',
    "Scannez votre passeport ou carte d'identité et prenez un selfie. Le badge ✔ ID vérifiée inspire confiance.",
    'Scanne deinen Pass oder Ausweis und mach ein Selfie. Das Abzeichen ✔ ID verifiziert schafft Vertrauen.',
    'Escaneie seu passaporte ou documento e tire uma selfie. O selo ✔ ID verificado gera confiança.',
    'Skanna ditt pass eller ID-kort och ta en selfie. Märket ✔ ID verifierat får andra att lita på dig.'],
  id_c: ['Verify my ID', 'Verificar mi identidad', 'Vérifier mon identité', 'Ausweis verifizieren', 'Verificar minha identidade', 'Verifiera mitt ID'],
  swipe_t: ['Like people on Discover', 'Da likes en Descubrir', 'Likez des profils dans Découvrir', 'Like Profile unter Entdecken', 'Curta perfis em Descobrir', 'Gilla profiler i Upptäck'],
  swipe_x: ["Swipe right (♥) on people you like and left to pass. A ★ super like shows you're really interested.",
    'Desliza a la derecha (♥) si te gusta y a la izquierda para pasar. Un ★ super like muestra que te interesa de verdad.',
    "Glissez à droite (♥) pour liker, à gauche pour passer. Un ★ super like montre que vous êtes vraiment intéressé.",
    'Wische nach rechts (♥), wenn dir jemand gefällt, nach links zum Überspringen. Ein ★ Super Like zeigt echtes Interesse.',
    'Deslize para a direita (♥) para curtir e para a esquerda para passar. Um ★ super like mostra interesse de verdade.',
    'Svep höger (♥) på dem du gillar och vänster för att hoppa över. En ★ superlike visar att du verkligen är intresserad.'],
  swipe_c: ['Start swiping', 'Empezar', 'Commencer', 'Loslegen', 'Começar', 'Börja svepa'],
  match_t: ['Get your first match', 'Consigue tu primer match', 'Obtenez votre premier match', 'Hol dir dein erstes Match', 'Consiga seu primeiro match', 'Få din första match'],
  match_x: ["When someone you liked likes you back, it's a match and your chat opens. Likes shows who already liked you.",
    'Cuando alguien a quien diste like te lo devuelve, es un match y se abre el chat. En Likes ves quién ya te dio like.',
    "Quand une personne que vous avez likée vous like aussi, c'est un match et le chat s'ouvre. Likes montre qui vous a déjà liké.",
    'Wenn dich jemand zurück-liked, ist es ein Match und euer Chat öffnet sich. Unter Likes siehst du, wer dich schon mag.',
    'Quando alguém que você curtiu curte você de volta, é um match e o chat abre. Em Curtidas você vê quem já curtiu você.',
    'När någon du gillat gillar dig tillbaka blir det en match och chatten öppnas. Under Gillningar ser du vem som redan gillar dig.'],
  match_c: ['See my likes', 'Ver mis likes', 'Voir mes likes', 'Meine Likes ansehen', 'Ver minhas curtidas', 'Se mina gillningar'],
  pass_t: ['Get the Family Pass', 'Consigue el Family Pass', 'Prenez le Family Pass', 'Hol dir den Family Pass', 'Adquira o Family Pass', 'Skaffa Family Pass'],
  pass_x: ['You need the Family Pass to message au pairs and to see who liked you.',
    'Necesitas el Family Pass para escribir a au pairs y ver quién te dio like.',
    'Le Family Pass permet d\'écrire aux au pairs et de voir qui vous a liké.',
    'Mit dem Family Pass kannst du Au-pairs schreiben und sehen, wer dich geliked hat.',
    'Você precisa do Family Pass para enviar mensagens a au pairs e ver quem curtiu você.',
    'Med Family Pass kan du skriva till au pairer och se vem som gillat dig.'],
  pass_c: ['See the Family Pass', 'Ver el Family Pass', 'Voir le Family Pass', 'Family Pass ansehen', 'Ver o Family Pass', 'Se Family Pass'],
  chat_t: ['Say hi to your match', 'Saluda a tu match', 'Dites bonjour à votre match', 'Sag Hallo zu deinem Match', 'Diga oi ao seu match', 'Säg hej till din match'],
  chat_x: ['Send a first message. Ask about daily routines, hobbies and what they hope for from the year.',
    'Envía un primer mensaje. Pregunta por la rutina diaria, las aficiones y qué esperan de este año.',
    "Envoyez un premier message. Parlez du quotidien, des loisirs et de ce que chacun attend de l'année.",
    'Schick eine erste Nachricht. Frag nach dem Alltag, Hobbys und was ihr euch von dem Jahr erhofft.',
    'Envie uma primeira mensagem. Pergunte sobre a rotina, hobbies e o que esperam deste ano.',
    'Skicka ett första meddelande. Fråga om vardagen, fritidsintressen och vad ni hoppas på inför året.'],
  chat_c: ['Open my chats', 'Abrir mis chats', 'Ouvrir mes chats', 'Chats öffnen', 'Abrir meus chats', 'Öppna mina chattar'],
  call_t: ['Have a video call', 'Haced una videollamada', 'Faites un appel vidéo', 'Macht einen Videoanruf', 'Façam uma videochamada', 'Ha ett videosamtal'],
  call_x: ['Meet face to face before you decide. Tap 📹 Video call in your chat to start a free call.',
    'Conoceos cara a cara antes de decidir. Pulsa 📹 Videollamada en el chat para llamar gratis.',
    'Rencontrez-vous en face à face avant de décider. Touchez 📹 Appel vidéo dans le chat pour un appel gratuit.',
    'Lernt euch von Angesicht zu Angesicht kennen, bevor ihr entscheidet. Tippe im Chat auf 📹 Videoanruf.',
    'Conheçam-se cara a cara antes de decidir. Toque em 📹 Videochamada no chat para ligar de graça.',
    'Träffas ansikte mot ansikte innan ni bestämmer er. Tryck på 📹 Videosamtal i chatten för ett gratis samtal.'],
  call_c: ['Open my chats', 'Abrir mis chats', 'Ouvrir mes chats', 'Chats öffnen', 'Abrir meus chats', 'Öppna mina chattar'],
  placement_t: ['Agree your placement', 'Acordad la estancia', 'Convenez du placement', 'Vereinbart den Aufenthalt', 'Combinem a estadia', 'Kom överens om placeringen'],
  placement_x: ["Found the one? Open their profile and tap 🧳 Propose placement. We check it against the country's au pair rules and give you both a checklist for the contract, visa, insurance and travel.",
    '¿Lo encontraste? Abre su perfil y pulsa 🧳 Proponer estancia. La comprobamos con las normas del país y os damos una lista para contrato, visado, seguro y viaje.',
    "C'est le bon ? Ouvrez son profil et touchez 🧳 Proposer un placement. Nous le vérifions selon les règles du pays et vous donnons une liste pour le contrat, le visa, l'assurance et le voyage.",
    'Gefunden? Öffne das Profil und tippe auf 🧳 Aufenthalt vorschlagen. Wir prüfen ihn nach den Regeln des Landes und geben euch eine Checkliste für Vertrag, Visum, Versicherung und Reise.',
    'Encontrou? Abra o perfil e toque em 🧳 Propor estadia. Conferimos com as regras do país e damos a vocês uma lista para contrato, visto, seguro e viagem.',
    'Hittat rätt? Öppna profilen och tryck på 🧳 Föreslå placering. Vi kontrollerar den mot landets regler och ger er en checklista för avtal, visum, försäkring och resa.'],
  placement_c: ['See placements', 'Ver estancias', 'Voir les placements', 'Aufenthalte ansehen', 'Ver estadias', 'Se placeringar'],
  // ---------- steps: agencies ----------
  code_t: ['Get your agency code', 'Recibe tu código de agencia', 'Recevez votre code agence', 'Erhalte deinen Agentur-Code', 'Receba seu código de agência', 'Få er byråkod'],
  code_x: ["We're setting up your agency code. It shows on Your agency once it's ready, usually within a day.",
    'Estamos preparando tu código de agencia. Aparecerá en Tu agencia cuando esté listo, normalmente en un día.',
    "Nous préparons votre code agence. Il apparaîtra dans Votre agence dès qu'il est prêt, en général sous un jour.",
    'Wir richten deinen Agentur-Code ein. Er erscheint unter Deine Agentur, sobald er fertig ist, meist innerhalb eines Tages.',
    'Estamos preparando seu código de agência. Ele aparece em Sua agência quando estiver pronto, normalmente em um dia.',
    'Vi förbereder er byråkod. Den visas under Er byrå när den är klar, oftast inom ett dygn.'],
  share_t: ['Share your code with your au pairs', 'Comparte tu código con tus au pairs', 'Partagez votre code avec vos au pairs', 'Teile deinen Code mit deinen Au-pairs', 'Compartilhe seu código com seus au pairs', 'Dela er kod med era au pairer'],
  share_x: ['Copy your link, or invite au pairs and families by email from Your agency. They join free and are linked to you.',
    'Copia tu enlace o invita a au pairs y familias por email desde Tu agencia. Se unen gratis y quedan vinculados a ti.',
    'Copiez votre lien ou invitez au pairs et familles par email depuis Votre agence. Ils rejoignent gratuitement et sont liés à vous.',
    'Kopiere deinen Link oder lade Au-pairs und Familien per E-Mail unter Deine Agentur ein. Sie treten kostenlos bei und sind mit dir verbunden.',
    'Copie seu link ou convide au pairs e famílias por email em Sua agência. Eles entram de graça e ficam ligados a você.',
    'Kopiera er länk, eller bjud in au pairer och familjer via e-post under Er byrå. De går med gratis och kopplas till er.'],
  share_c: ['Open Your agency', 'Abrir Tu agencia', 'Ouvrir Votre agence', 'Deine Agentur öffnen', 'Abrir Sua agência', 'Öppna Er byrå'],
  ap_joined_t: ['Your first au pair joins', 'Se une tu primer au pair', 'Votre premier au pair arrive', 'Dein erstes Au-pair tritt bei', 'Seu primeiro au pair entra', 'Er första au pair går med'],
  ap_joined_x: ['Au pairs who sign up with your code or link count here. The agency guide video shows how to invite them.',
    'Aquí cuentan los au pairs que se registran con tu código o enlace. El vídeo guía para agencias muestra cómo invitarlos.',
    "Les au pairs inscrits avec votre code ou lien comptent ici. La vidéo guide pour agences montre comment les inviter.",
    'Hier zählen Au-pairs, die sich mit deinem Code oder Link anmelden. Das Guide-Video für Agenturen zeigt, wie du sie einlädst.',
    'Aqui contam os au pairs que se cadastram com seu código ou link. O vídeo guia para agências mostra como convidá-los.',
    'Här räknas au pairer som registrerar sig med er kod eller länk. Guidevideon för byråer visar hur ni bjuder in dem.'],
  ap_joined_c: ['Watch the guide', 'Ver la guía', 'Voir le guide', 'Guide ansehen', 'Ver o guia', 'Se guiden'],
  visible_t: ['Get a profile ready for families', 'Prepara un perfil para las familias', 'Préparez un profil pour les familles', 'Mach ein Profil für Familien bereit', 'Deixe um perfil pronto para as famílias', 'Gör en profil redo för familjer'],
  visible_x: ['An au pair shows to families once their profile has a photo and an About me. Help your au pairs finish theirs.',
    'Un au pair aparece para las familias cuando su perfil tiene foto y un Sobre mí. Ayuda a tus au pairs a completarlo.',
    "Un au pair est visible des familles dès que son profil a une photo et une présentation. Aidez vos au pairs à le compléter.",
    'Ein Au-pair wird Familien angezeigt, sobald das Profil ein Foto und „Über mich“ hat. Hilf deinen Au-pairs, es fertigzustellen.',
    'Um au pair aparece para as famílias quando o perfil tem foto e um Sobre mim. Ajude seus au pairs a completar o deles.',
    'En au pair visas för familjer när profilen har ett foto och en Om mig. Hjälp era au pairer att fylla i sina.'],
  fam_joined_t: ['Bring in your host families', 'Trae a tus familias anfitrionas', "Faites venir vos familles d'accueil", 'Hol deine Gastfamilien dazu', 'Traga suas famílias anfitriãs', 'Ta in era värdfamiljer'],
  fam_joined_x: ['Families who join with your code see your au pairs first, marked "Prepared & approved" by your agency.',
    'Las familias que se unen con tu código ven primero a tus au pairs, marcados como "Preparado y aprobado" por tu agencia.',
    'Les familles inscrites avec votre code voient d\'abord vos au pairs, marqués « Préparé et approuvé » par votre agence.',
    'Familien, die mit deinem Code beitreten, sehen zuerst deine Au-pairs, markiert mit „Vorbereitet & geprüft“ von deiner Agentur.',
    'As famílias que entram com seu código veem primeiro seus au pairs, marcados como "Preparado e aprovado" pela sua agência.',
    'Familjer som går med med er kod ser era au pairer först, märkta "Förberedd och godkänd" av er byrå.'],
  ag_placement_t: ['Your first placement', 'Tu primera estancia', 'Votre premier placement', 'Dein erster Aufenthalt', 'Sua primeira estadia', 'Er första placering'],
  ag_placement_x: ['When one of your au pairs or families agrees a placement, it counts here and on Your agency.',
    'Cuando uno de tus au pairs o familias acuerda una estancia, cuenta aquí y en Tu agencia.',
    "Quand un de vos au pairs ou familles convient d'un placement, il compte ici et dans Votre agence.",
    'Wenn eines deiner Au-pairs oder eine deiner Familien einen Aufenthalt vereinbart, zählt er hier und unter Deine Agentur.',
    'Quando um dos seus au pairs ou famílias combina uma estadia, ela conta aqui e em Sua agência.',
    'När en av era au pairer eller familjer kommer överens om en placering räknas den här och under Er byrå.'],
  // ---------- steps: Community Managers ----------
  meetup_t: ['Host your first meetup', 'Organiza tu primer encuentro', 'Organisez votre première rencontre', 'Veranstalte dein erstes Treffen', 'Organize seu primeiro encontro', 'Håll din första träff'],
  meetup_x: ['Create an event for au pairs, families or both. Everyone on Nearby in your city hears about it.',
    'Crea un evento para au pairs, familias o ambos. Todos los que usan Cerca en tu ciudad se enteran.',
    'Créez un événement pour les au pairs, les familles ou les deux. Tous les membres À proximité de votre ville sont prévenus.',
    'Erstelle ein Event für Au-pairs, Familien oder beide. Alle unter In der Nähe in deiner Stadt erfahren davon.',
    'Crie um evento para au pairs, famílias ou ambos. Todos no Por perto da sua cidade ficam sabendo.',
    'Skapa ett evenemang för au pairer, familjer eller båda. Alla på I närheten i din stad får veta det.'],
  meetup_c: ['Open Your community', 'Abrir Tu comunidad', 'Ouvrir Votre communauté', 'Deine Community öffnen', 'Abrir Sua comunidade', 'Öppna Din community'],
  checkin_t: ['Check people in', 'Registra a los asistentes', 'Enregistrez les participants', 'Checke Teilnehmende ein', 'Faça o check-in dos participantes', 'Checka in deltagarna'],
  checkin_x: ['At the door, show the check-in QR code from your event. Check-ins are how events count towards your pay.',
    'En la entrada, muestra el código QR de tu evento. Los check-ins cuentan para tu pago.',
    "À l'entrée, montrez le QR code de votre événement. Les check-ins comptent pour votre rémunération.",
    'Zeig am Eingang den Check-in-QR-Code deines Events. Check-ins zählen für deine Bezahlung.',
    'Na entrada, mostre o QR code do seu evento. Os check-ins contam para o seu pagamento.',
    'Visa evenemangets QR-kod för incheckning vid dörren. Incheckningarna räknas för din ersättning.'],
  rating_t: ['Get your first ratings', 'Recibe tus primeras valoraciones', 'Recevez vos premières notes', 'Erhalte deine ersten Bewertungen', 'Receba suas primeiras avaliações', 'Få dina första betyg'],
  rating_x: ['People who checked in are asked to rate the event for a few days after. A 4-star average helps make it a successful event.',
    'A quienes hicieron check-in se les pide valorar el evento durante unos días. Una media de 4 estrellas ayuda a que sea un evento exitoso.',
    "Les personnes enregistrées sont invitées à noter l'événement pendant quelques jours. Une moyenne de 4 étoiles aide à en faire un événement réussi.",
    'Wer eingecheckt hat, wird ein paar Tage lang um eine Bewertung gebeten. Ein Schnitt von 4 Sternen macht es zu einem erfolgreichen Event.',
    'Quem fez check-in é convidado a avaliar o evento por alguns dias. Uma média de 4 estrelas ajuda a torná-lo um evento de sucesso.',
    'De som checkat in ombeds betygsätta evenemanget några dagar efteråt. Ett snitt på 4 stjärnor hjälper till att göra det lyckat.'],
  // ---------- the next-step card in the app ----------
  next_title: ['Next step: {step}', 'Siguiente paso: {step}', 'Prochaine étape : {step}', 'Nächster Schritt: {step}', 'Próximo passo: {step}', 'Nästa steg: {step}'],
  progress: ['{done} of {total} done', '{done} de {total} hechos', '{done} sur {total} faits', '{done} von {total} erledigt', '{done} de {total} feitos', '{done} av {total} klara'],
  // ---------- tour ----------
  t_welcome_t: ['Welcome to PairMundo', 'Bienvenido a PairMundo', 'Bienvenue sur PairMundo', 'Willkommen bei PairMundo', 'Bem-vindo ao PairMundo', 'Välkommen till PairMundo'],
  t_welcome_aupair: ['Find your host family like you would find a match: swipe, match, chat, then agree your stay safely. Here is how, in four steps.',
    'Encuentra tu familia como encontrarías un match: desliza, haz match, chatea y acordad la estancia con seguridad. Así funciona, en cuatro pasos.',
    "Trouvez votre famille d'accueil comme on trouve un match : swipez, matchez, discutez, puis convenez du séjour en toute sécurité. Voici comment, en quatre étapes.",
    'Finde deine Gastfamilie wie ein Match: wischen, matchen, chatten und dann den Aufenthalt sicher vereinbaren. So geht es, in vier Schritten.',
    'Encontre sua família anfitriã como um match: deslize, dê match, converse e combine a estadia com segurança. Veja como, em quatro passos.',
    'Hitta din värdfamilj som en match: svep, matcha, chatta och kom sedan överens om vistelsen på ett tryggt sätt. Så här går det till, i fyra steg.'],
  t_welcome_family: ['Find your au pair like you would find a match: swipe, match, chat, then agree the stay safely. Here is how, in four steps.',
    'Encuentra a tu au pair como encontrarías un match: desliza, haz match, chatea y acordad la estancia con seguridad. Así funciona, en cuatro pasos.',
    'Trouvez votre au pair comme on trouve un match : swipez, matchez, discutez, puis convenez du séjour en toute sécurité. Voici comment, en quatre étapes.',
    'Finde dein Au-pair wie ein Match: wischen, matchen, chatten und dann den Aufenthalt sicher vereinbaren. So geht es, in vier Schritten.',
    'Encontre seu au pair como um match: deslize, dê match, converse e combine a estadia com segurança. Veja como, em quatro passos.',
    'Hitta er au pair som en match: svep, matcha, chatta och kom sedan överens om vistelsen på ett tryggt sätt. Så här går det till, i fyra steg.'],
  t_profile_t: ['1. Make your profile shine', '1. Haz que tu perfil brille', '1. Soignez votre profil', '1. Lass dein Profil glänzen', '1. Faça seu perfil brilhar', '1. Få din profil att lysa'],
  t_profile_aupair: ['Families see your photos first. Add 3 or more, a few words about you and your languages, and verify your ID for the ✔ badge.',
    'Las familias ven primero tus fotos. Añade 3 o más, unas palabras sobre ti y tus idiomas, y verifica tu identidad para la insignia ✔.',
    "Les familles voient d'abord vos photos. Ajoutez-en 3 ou plus, quelques mots sur vous et vos langues, et vérifiez votre identité pour le badge ✔.",
    'Familien sehen zuerst deine Fotos. Füge 3 oder mehr hinzu, ein paar Worte über dich und deine Sprachen, und verifiziere deinen Ausweis für das ✔.',
    'As famílias veem primeiro suas fotos. Adicione 3 ou mais, algumas palavras sobre você e seus idiomas, e verifique sua identidade para o selo ✔.',
    'Familjer ser dina foton först. Lägg till 3 eller fler, några ord om dig och dina språk, och verifiera ditt ID för ✔-märket.'],
  t_profile_family: ['Au pairs see your photos first. Add 3 or more, a few words about your family, the children\'s ages and your start date.',
    'Los au pairs ven primero tus fotos. Añade 3 o más, unas palabras sobre tu familia, las edades de los niños y la fecha de inicio.',
    "Les au pairs voient d'abord vos photos. Ajoutez-en 3 ou plus, quelques mots sur votre famille, l'âge des enfants et la date de début.",
    'Au-pairs sehen zuerst eure Fotos. Füge 3 oder mehr hinzu, ein paar Worte über eure Familie, das Alter der Kinder und den Starttermin.',
    'Os au pairs veem primeiro suas fotos. Adicione 3 ou mais, algumas palavras sobre a família, a idade das crianças e a data de início.',
    'Au pairer ser era foton först. Lägg till 3 eller fler, några ord om er familj, barnens åldrar och startdatum.'],
  t_swipe_t: ['2. Swipe and match', '2. Desliza y haz match', '2. Swipez et matchez', '2. Wischen und matchen', '2. Deslize e dê match', '2. Svep och matcha'],
  t_swipe_x: ["On Discover, swipe right (♥) to like, left to pass, or ★ to super like. When they like you back, it's a match.",
    'En Descubrir, desliza a la derecha (♥) para dar like, a la izquierda para pasar o ★ para super like. Si te lo devuelven, es un match.',
    "Dans Découvrir, glissez à droite (♥) pour liker, à gauche pour passer, ou ★ pour un super like. S'ils vous likent aussi, c'est un match.",
    'Unter Entdecken wischst du nach rechts (♥) für ein Like, nach links zum Überspringen oder ★ für ein Super Like. Liken sie zurück, ist es ein Match.',
    'Em Descobrir, deslize para a direita (♥) para curtir, para a esquerda para passar ou ★ para super like. Se curtirem de volta, é match.',
    'I Upptäck sveper du höger (♥) för att gilla, vänster för att hoppa över eller ★ för superlike. Gillar de dig tillbaka blir det en match.'],
  t_chat_t: ['3. Chat and video call', '3. Chatea y haz videollamadas', '3. Discutez et appelez en vidéo', '3. Chatten und Videoanruf', '3. Converse e faça videochamada', '3. Chatta och ha videosamtal'],
  t_chat_x: ['Get to know each other in the chat, then meet face to face with a free video call, right from the chat.',
    'Conoceos en el chat y luego cara a cara con una videollamada gratis, desde el mismo chat.',
    'Faites connaissance dans le chat, puis en face à face avec un appel vidéo gratuit, directement depuis le chat.',
    'Lernt euch im Chat kennen und dann von Angesicht zu Angesicht mit einem kostenlosen Videoanruf direkt aus dem Chat.',
    'Conheçam-se no chat e depois cara a cara com uma videochamada grátis, direto do chat.',
    'Lär känna varandra i chatten och träffas sedan ansikte mot ansikte med ett gratis videosamtal direkt från chatten.'],
  t_chat_pass: ['Chatting with au pairs needs the Family Pass.', 'Para chatear con au pairs necesitas el Family Pass.', 'Discuter avec les au pairs nécessite le Family Pass.', 'Zum Chatten mit Au-pairs brauchst du den Family Pass.', 'Para conversar com au pairs você precisa do Family Pass.', 'För att chatta med au pairer behöver du Family Pass.'],
  t_place_t: ['4. Agree your placement', '4. Acordad la estancia', '4. Convenez du placement', '4. Vereinbart den Aufenthalt', '4. Combinem a estadia', '4. Kom överens om placeringen'],
  t_place_x: ["Propose a placement from their profile. We check it against the country's au pair rules and give you both a checklist for the contract, visa, insurance and travel.",
    'Propón una estancia desde su perfil. La comprobamos con las normas del país y os damos una lista para contrato, visado, seguro y viaje.',
    "Proposez un placement depuis son profil. Nous le vérifions selon les règles du pays et vous donnons une liste pour le contrat, le visa, l'assurance et le voyage.",
    'Schlag einen Aufenthalt über das Profil vor. Wir prüfen ihn nach den Regeln des Landes und geben euch eine Checkliste für Vertrag, Visum, Versicherung und Reise.',
    'Proponha uma estadia pelo perfil. Conferimos com as regras do país e damos a vocês uma lista para contrato, visto, seguro e viagem.',
    'Föreslå en placering från profilen. Vi kontrollerar den mot landets regler och ger er en checklista för avtal, visum, försäkring och resa.'],
  t_agency_t: ['Welcome, {name}', 'Bienvenidos, {name}', 'Bienvenue, {name}', 'Willkommen, {name}', 'Bem-vindos, {name}', 'Välkommen, {name}'],
  t_agency_x: ['Here is how PairMundo works for your agency, in three steps.', 'Así funciona PairMundo para tu agencia, en tres pasos.', 'Voici comment PairMundo fonctionne pour votre agence, en trois étapes.', 'So funktioniert PairMundo für deine Agentur, in drei Schritten.', 'Veja como o PairMundo funciona para sua agência, em três passos.', 'Så här fungerar PairMundo för er byrå, i tre steg.'],
  t_code_t: ['1. Your agency code', '1. Tu código de agencia', '1. Votre code agence', '1. Dein Agentur-Code', '1. Seu código de agência', '1. Er byråkod'],
  t_code_x: ['Au pairs and families join free with your code or link, and are linked to your agency. You can also invite them by email.',
    'Au pairs y familias se unen gratis con tu código o enlace y quedan vinculados a tu agencia. También puedes invitarlos por email.',
    "Au pairs et familles rejoignent gratuitement avec votre code ou lien et sont liés à votre agence. Vous pouvez aussi les inviter par email.",
    'Au-pairs und Familien treten kostenlos mit deinem Code oder Link bei und sind mit deiner Agentur verbunden. Du kannst sie auch per E-Mail einladen.',
    'Au pairs e famílias entram de graça com seu código ou link e ficam ligados à sua agência. Você também pode convidá-los por email.',
    'Au pairer och familjer går med gratis med er kod eller länk och kopplas till er byrå. Ni kan också bjuda in dem via e-post.'],
  t_who_t: ['2. You choose who sees whom', '2. Tú eliges quién ve a quién', '2. Vous choisissez qui voit qui', '2. Du bestimmst, wer wen sieht', '2. Você escolhe quem vê quem', '2. Ni väljer vem som ser vem'],
  t_who_x: ['On Your agency, decide which au pairs your families see and who sees your au pairs. Your au pairs show "Prepared & approved" by you.',
    'En Tu agencia decides qué au pairs ven tus familias y quién ve a tus au pairs. Tus au pairs muestran "Preparado y aprobado" por ti.',
    'Dans Votre agence, choisissez quels au pairs vos familles voient et qui voit vos au pairs. Vos au pairs affichent « Préparé et approuvé » par vous.',
    'Unter Deine Agentur legst du fest, welche Au-pairs deine Familien sehen und wer deine Au-pairs sieht. Deine Au-pairs tragen „Vorbereitet & geprüft“.',
    'Em Sua agência, decida quais au pairs suas famílias veem e quem vê seus au pairs. Seus au pairs mostram "Preparado e aprovado" por você.',
    'Under Er byrå väljer ni vilka au pairer era familjer ser och vem som ser era au pairer. Era au pairer visas som "Förberedd och godkänd" av er.'],
  t_guides_t: ['3. Guides when you need them', '3. Guías cuando las necesites', '3. Des guides quand vous en avez besoin', '3. Guides, wenn du sie brauchst', '3. Guias quando precisar', '3. Guider när ni behöver dem'],
  t_guides_x: ['Short videos under Guides show every step, from inviting people to Closed Loop.',
    'Vídeos cortos en Guías muestran cada paso, desde invitar hasta Closed Loop.',
    "De courtes vidéos dans Guides montrent chaque étape, de l'invitation au Closed Loop.",
    'Kurze Videos unter Guides zeigen jeden Schritt, vom Einladen bis zum Closed Loop.',
    'Vídeos curtos em Guias mostram cada passo, do convite ao Closed Loop.',
    'Korta videor under Guider visar varje steg, från inbjudan till Closed Loop.'],
  t_cm_t: ['Welcome, Community Manager', 'Bienvenido, Community Manager', 'Bienvenue, Community Manager', 'Willkommen, Community Manager', 'Bem-vindo, Community Manager', 'Välkommen, Community Manager'],
  t_cm_x: ["You run PairMundo's community in {city}. Here is your month, in three steps.", 'Diriges la comunidad de PairMundo en {city}. Así es tu mes, en tres pasos.', 'Vous animez la communauté PairMundo à {city}. Voici votre mois, en trois étapes.', 'Du leitest die PairMundo-Community in {city}. So sieht dein Monat aus, in drei Schritten.', 'Você coordena a comunidade PairMundo em {city}. Veja seu mês, em três passos.', 'Du driver PairMundos community i {city}. Så här ser din månad ut, i tre steg.'],
  t_host_t: ['1. Host meetups', '1. Organiza encuentros', '1. Organisez des rencontres', '1. Veranstalte Treffen', '1. Organize encontros', '1. Håll träffar'],
  t_host_x: ['Create events from Your community. Everyone on Nearby in your city hears about them, and your kit has posters and post templates.',
    'Crea eventos desde Tu comunidad. Todos en Cerca en tu ciudad se enteran, y tu kit tiene carteles y plantillas.',
    'Créez des événements depuis Votre communauté. Tous les membres À proximité de votre ville sont prévenus, et votre kit contient affiches et modèles.',
    'Erstelle Events unter Deine Community. Alle unter In der Nähe in deiner Stadt erfahren davon, und dein Kit hat Poster und Vorlagen.',
    'Crie eventos em Sua comunidade. Todos no Por perto da sua cidade ficam sabendo, e seu kit tem cartazes e modelos.',
    'Skapa evenemang under Din community. Alla på I närheten i din stad får veta det, och ditt kit har affischer och mallar.'],
  t_door_t: ['2. Check people in', '2. Registra a los asistentes', '2. Enregistrez les participants', '2. Checke Teilnehmende ein', '2. Faça o check-in', '2. Checka in deltagarna'],
  t_door_x: ['Show the QR code at the door. Check-ins and ratings decide which events are successful.',
    'Muestra el código QR en la entrada. Los check-ins y las valoraciones deciden qué eventos son exitosos.',
    "Montrez le QR code à l'entrée. Les check-ins et les notes déterminent les événements réussis.",
    'Zeig den QR-Code am Eingang. Check-ins und Bewertungen entscheiden, welche Events erfolgreich sind.',
    'Mostre o QR code na entrada. Check-ins e avaliações decidem quais eventos são de sucesso.',
    'Visa QR-koden vid dörren. Incheckningar och betyg avgör vilka evenemang som är lyckade.'],
  t_pay_t: ['3. Get paid', '3. Cobra', '3. Soyez payé', '3. Werde bezahlt', '3. Receba', '3. Få betalt'],
  t_pay_x: ["Your page shows this month's events, check-ins and pay, and you can claim agreed event costs there.",
    'Tu página muestra los eventos, check-ins y pago del mes, y ahí puedes reclamar los gastos acordados.',
    'Votre page affiche les événements, check-ins et la rémunération du mois, et vous pouvez y déclarer les frais convenus.',
    'Deine Seite zeigt Events, Check-ins und Bezahlung des Monats, und dort reichst du vereinbarte Kosten ein.',
    'Sua página mostra os eventos, check-ins e pagamento do mês, e ali você pede o reembolso dos custos combinados.',
    'Din sida visar månadens evenemang, incheckningar och ersättning, och där begär du ersättning för överenskomna kostnader.'],
};

/** Text for key in lang, with {placeholders} filled from vars. */
export function gt(lang, key, vars = {}) {
  const row = TEXT[key];
  if (!row) return key;
  const i = LANGS.indexOf(lang) + 1;
  return (row[i] || row[0]).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
export const GUIDE_TEXT = TEXT;

const SNOOZE_STEP_DAYS = 3; // a closed next-step card stays away this long
const SNOOZE_ALL_HOURS = 20; // and no other next-step card shows until the next day

export function mountGuide(api, { db, wrap, requireAuth, profileGaps, passView, identityOn, community, pickLang }) {
  const one = (sql, ...p) => !!db.prepare(sql).get(...p);
  const state = (userId) => {
    const s = db.prepare('SELECT * FROM guide_state WHERE user_id = ?').get(userId);
    let snooze = {};
    try { snooze = JSON.parse(s?.snooze || '{}') || {}; } catch { snooze = {}; }
    return { tour_seen_at: s?.tour_seen_at ?? null, hidden: !!s?.hidden, snooze };
  };
  const save = (userId, patch) => {
    const cur = state(userId);
    const next = { ...cur, ...patch };
    db.prepare(`INSERT INTO guide_state (user_id, tour_seen_at, hidden, snooze) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET tour_seen_at = excluded.tour_seen_at, hidden = excluded.hidden, snooze = excluded.snooze`)
      .run(userId, next.tour_seen_at, next.hidden ? 1 : 0, JSON.stringify(next.snooze || {}));
  };

  // Conversations with the other side (au pair with family), not "say hi" chats between two au pairs on Nearby.
  const pairChats = `SELECT c.id, c.created_at FROM conversations c JOIN users o ON o.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
    WHERE (c.user_a = ? OR c.user_b = ?) AND o.role IN ('aupair', 'family') AND o.role != ?`;
  const latestChat = (u) => db.prepare(`SELECT c.id FROM (${pairChats}) c
    LEFT JOIN messages m ON m.conversation_id = c.id GROUP BY c.id ORDER BY MAX(COALESCE(m.created_at, c.created_at)) DESC LIMIT 1`).get(u.id, u.id, u.id, u.role);

  /** [{ key, done, link }] for a member, in the order they happen. */
  const memberSteps = (u) => {
    const chatIds = `SELECT id FROM (${pairChats})`;
    const chatArgs = [u.id, u.id, u.id, u.role];
    const pass = passView(u);
    const chat = latestChat(u);
    const chatLink = chat ? `#/messages/${chat.id}` : '#/matches';
    return [
      { key: 'email', done: !!u.email_verified, link: '#/verify' },
      { key: 'profile', done: !profileGaps(u).length, link: '#/profile' },
      ...(identityOn() || u.id_verified ? [{ key: 'id', done: !!u.id_verified, link: '#/account' }] : []),
      { key: 'swipe', done: one("SELECT 1 FROM swipes WHERE user_id = ? AND direction IN ('like', 'super')", u.id), link: '#/discover' },
      { key: 'match', done: !!chat, link: '#/likes' },
      ...(u.role === 'family' && pass.required ? [{ key: 'pass', done: pass.active, link: '#/family-pass' }] : []),
      { key: 'chat', done: one(`SELECT 1 FROM messages WHERE sender_id = ? AND call_url IS NULL AND conversation_id IN (${chatIds})`, u.id, ...chatArgs), link: chatLink },
      { key: 'call', done: one(`SELECT 1 FROM messages WHERE call_url IS NOT NULL AND conversation_id IN (${chatIds})`, ...chatArgs), link: chatLink },
      { key: 'placement', done: one("SELECT 1 FROM placements WHERE (aupair_id = ? OR family_id = ?) AND status != 'cancelled'", u.id, u.id), link: '#/placements' },
    ];
  };
  const agencySteps = (u) => {
    const amb = db.prepare("SELECT * FROM ambassadors WHERE user_id = ? AND kind = 'agency' AND active = 1 ORDER BY id LIMIT 1").get(u.id);
    const code = amb?.code ?? '\u0000';
    const joined = (role) => one("SELECT 1 FROM users WHERE upper(ref_code) = upper(?) AND role = ?", code, role);
    const apJoined = joined('aupair');
    return [
      { key: 'email', done: !!u.email_verified, link: '#/verify' },
      { key: 'code', done: !!amb, link: null },
      { key: 'share', done: !!amb && (apJoined || joined('family') || one('SELECT 1 FROM agency_family_invites WHERE ambassador_id = ?', amb.id)), link: '#/agency' },
      { key: 'ap_joined', done: apJoined, link: '#/guides' },
      { key: 'visible', done: one(`SELECT 1 FROM users x JOIN aupair_profiles p ON p.user_id = x.id WHERE upper(x.ref_code) = upper(?) AND x.role = 'aupair'
          AND x.photos != '[]' AND trim(COALESCE(p.bio, '')) != ''`, code), link: '#/agency' },
      { key: 'fam_joined', done: joined('family'), link: '#/agency' },
      { key: 'ag_placement', done: one(`SELECT 1 FROM placements p JOIN users a ON a.id = p.aupair_id JOIN users f ON f.id = p.family_id
          WHERE p.status != 'cancelled' AND (upper(a.ref_code) = upper(?) OR upper(f.ref_code) = upper(?))`, code, code), link: '#/agency' },
    ];
  };
  const managerSteps = (u) => {
    const mine = "SELECT id FROM meetups WHERE (created_by = ? OR host_id = ?) AND status != 'cancelled'";
    return [
      { key: 'email', done: !!u.email_verified, link: '#/verify' },
      { key: 'meetup', done: one(mine, u.id, u.id), link: '#/community' },
      { key: 'checkin', done: one(`SELECT 1 FROM meetup_checkins WHERE meetup_id IN (${mine})`, u.id, u.id), link: '#/community' },
      { key: 'rating', done: one(`SELECT 1 FROM meetup_ratings WHERE meetup_id IN (${mine})`, u.id, u.id), link: '#/community' },
    ];
  };

  /** Which guide applies to an account: aupair | family | agency | community, or null (admin, staff, other ambassadors). */
  const kindOf = (u) => (['aupair', 'family', 'agency'].includes(u.role) ? u.role : community.managerOf(u) ? 'community' : null);

  const stepText = (lang, kind, s) => {
    const x = s.key === 'profile' ? `profile_x_${kind}` : `${s.key}_x`;
    const c = { code: null, visible: 'share', fam_joined: 'share', ag_placement: 'share', checkin: 'meetup', rating: 'meetup' }[s.key] ?? s.key;
    return { ...s, title: gt(lang, `${s.key}_t`), text: gt(lang, x), cta: c && s.link ? gt(lang, `${c}_c`) : null };
  };
  const tourFor = (lang, kind, u) => {
    const slide = (icon, t, x, vars) => ({ icon, title: gt(lang, t, vars), text: x.map((k) => gt(lang, k, vars)).join(' ') });
    if (kind === 'agency') {
      return [slide('👋', 't_agency_t', ['t_agency_x'], { name: u.name }), slide('🔑', 't_code_t', ['t_code_x']), slide('👀', 't_who_t', ['t_who_x']), slide('🎬', 't_guides_t', ['t_guides_x'])];
    }
    if (kind === 'community') {
      const city = community.managerOf(u)?.city || '';
      return [slide('👋', 't_cm_t', ['t_cm_x'], { city }), slide('☕', 't_host_t', ['t_host_x']), slide('📲', 't_door_t', ['t_door_x']), slide('💸', 't_pay_t', ['t_pay_x'])];
    }
    const pass = kind === 'family' && passView(u);
    return [slide('👋', 't_welcome_t', [`t_welcome_${kind}`]), slide('📸', 't_profile_t', [`t_profile_${kind}`]), slide('♥', 't_swipe_t', ['t_swipe_x']),
      slide('💬', 't_chat_t', ['t_chat_x', ...(pass?.required && !pass.active ? ['t_chat_pass'] : [])]), slide('🧳', 't_place_t', ['t_place_x'])];
  };

  /** The whole guide for an account, in lang, or null when no guide applies. */
  const guideFor = (u, lang) => {
    const kind = kindOf(u);
    if (!kind) return null;
    const raw = kind === 'agency' ? agencySteps(u) : kind === 'community' ? managerSteps(u) : memberSteps(u);
    const steps = raw.map((s) => stepText(lang, kind, s));
    const done = steps.filter((s) => s.done).length;
    const st = state(u.id);
    return { kind, steps, done, total: steps.length, complete: done === steps.length, next: steps.find((s) => !s.done)?.key ?? null,
      hidden: st.hidden, tour_seen: !!st.tour_seen_at, tour: tourFor(lang, kind, u) };
  };

  const langOf = (req) => pickLang(req.get('accept-language')) || req.user.lang || 'en';
  api.get('/guide', requireAuth, wrap((req) => ({ guide: guideFor(req.user, langOf(req)) })));
  api.post('/guide/tour-seen', requireAuth, wrap((req) => { save(req.user.id, { tour_seen_at: new Date().toISOString() }); return { ok: true }; }));
  // Hide or bring back the getting-started card.
  api.put('/guide/hidden', requireAuth, wrap((req) => { save(req.user.id, { hidden: !!req.body?.hidden }); return { ok: true }; }));

  return {
    /** The next step as a news card for the phone app (au pairs and families), or null. The app already nudges people
     *  to confirm their email and fill in their profile, so the card starts after those. */
    newsFor(u) {
      const kind = kindOf(u);
      if (!['aupair', 'family'].includes(kind)) return null;
      const lang = u.lang || 'en';
      const g = guideFor(u, lang);
      if (g.hidden || g.complete) return null;
      if (g.steps.some((s) => ['email', 'profile'].includes(s.key) && !s.done)) return null;
      const now = Date.now();
      const { snooze } = state(u.id);
      if (snooze._all && Date.parse(snooze._all) > now) return null;
      const step = g.steps.find((s) => !s.done && !(snooze[s.key] && Date.parse(snooze[s.key]) > now));
      if (!step) return null;
      return { id: `step-${step.key}`, title: gt(lang, 'next_title', { step: step.title }),
        text: `${step.text}\n\n${gt(lang, 'progress', { done: g.done, total: g.total })}`, link: step.link, created_at: null, guide: true };
    },
    /** Someone closed a next-step card: keep that step away for a few days, and any other for the rest of the day. */
    snooze(u, key) {
      if (!/^[a-z_]{1,20}$/.test(key)) return;
      const now = Date.now();
      const { snooze } = state(u.id);
      save(u.id, { snooze: { ...snooze, [key]: new Date(now + SNOOZE_STEP_DAYS * 86400e3).toISOString(), _all: new Date(now + SNOOZE_ALL_HOURS * 3600e3).toISOString() } });
    },
    guideFor,
  };
}
