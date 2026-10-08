# PairMundo

A global au pair matching platform that works like a dating app: profiles lead with photos, you swipe right to like and left to pass, and when a family and an au pair like each other it's a match and chat opens. From there they agree a placement that is checked against the destination country's program rules, track the placement checklist, and review each other when it is done.

## Run it

Requires Node.js 20 or newer. On Node 22.5+ it uses the built-in `node:sqlite`; on older Node it installs and uses `better-sqlite3` instead.

```bash
npm install
npm run seed     # optional: demo data (all passwords: password123)
npm start        # http://localhost:3000
npm test
```

Demo accounts after seeding: `millers@aupair.test` (US host family), `schmidts@aupair.test` (German family), `maria@aupair.test` and `thandi@aupair.test` (au pairs), `admin@aupair.test` (program admin).

Settings: `PORT` (default 3000), `DB_FILE` (default `data/aupair.db`), `UPLOAD_DIR` (default `data/uploads`), `NODE_ENV=production` (secure cookies).

Live hosting: `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) create the first admin account on an empty database; `TRUST_PROXY=1` (automatic with `NODE_ENV=production`) makes rate limits use the visitor's IP behind a proxy. See `../DEPLOY.md`.

Email: set `RESEND_API_KEY` and `MAIL_FROM` (for example `PairMundo <hello@pairmundo.com>`) to send verification and password-reset codes through [Resend](https://resend.com). Without them the server prints each email, code included, in its terminal, which is fine for local testing.

## Features

| Area | What it does |
| --- | --- |
| Accounts | Au pair, host family and admin roles; scrypt password hashing; HttpOnly session cookie (or Bearer token); login rate limit. Email confirmation with a 6-digit code (needed before liking, messaging or proposing a placement); forgot password with an emailed code, which also signs out other sessions. Codes are stored hashed, expire after 30 minutes and lock after 5 wrong tries. Account deletion with the password removes the profile, photos, matches, chats, placements and reviews. |
| Swipe to match | Photo-first card deck ranked by match score. Drag or use the buttons/arrow keys: right = like, left = pass, up = super like; tap the photo to flip through pictures, tap the caption for the full profile. Mutual like shows "It's a match!" and opens a chat. Undo the last swipe; bring back passed profiles when the deck runs out. "Likes you" badge on cards. |
| Likes & matches | **Likes** shows everyone who liked you (super likes flagged, with their intro note). **Matches** shows match bubbles and conversations with unread counts. |
| Photos | Up to 6 photos per profile with a Tinder-style gallery; upload, remove and choose the main photo. Images are resized in the browser, type-checked by magic bytes on the server and stored in `data/uploads/`. Demo accounts use illustrated portraits, not real people. |
| Profiles | Au pairs: birth date, nationality, languages with CEFR level, childcare years, age groups, skills, license, availability, stay length, destination wishes. Families: children's ages, home and required languages, start date, hours, pocket money, driver/pets/room. Profile completeness meter. |
| Matching | 0-100 score from destination wish, languages, date fit, stay length, experience with the children's ages, practical needs and reputation, with the reasons and warnings shown. Au pairs outside the country's age range are capped at 30. |
| Search | Filters for country, nationality, language, age, availability, license, rating and ID verification; sort by match, rating or recent activity. Saved favourites. |
| Match requests | A like is a match request under the hood, so the older accept/decline list at `#/requests` and the list view search still work. |
| Messaging | Opens only after a mutual match (anti-spam/safety); unread counts; live polling. |
| Placements | Proposed by either side, confirmed by both, then active and completed. Checked against the country program (age, max hours, min pocket money, stay length); rule-breaking placements are refused. Auto-generated checklist (contract, visa, insurance, travel, language course, check-ins) with due dates. |
| Ratings | Two-way reviews only from a real placement that has started. Overall stars plus role-specific criteria. Double-blind: hidden until both sides review or 14 days after the end. Public reply by the reviewee; reviews can be reported and hidden by admins. |
| Country programs | Indicative rules for US, DE, FR, NL, DK, NO, SE, ES, CH, GB, IE, AU, BE with visa route, obligations and official source links; admins can edit them. |
| Trust & safety | Block anyone from their profile or chat (optionally reporting them at the same time): both people disappear from each other's deck, likes, profile and messages, and pending likes are cancelled. Blocked list with unblock under Account and safety. Admin-set badges for ID, references and background checks; suspension; profile and review reports with a moderation queue. |
| Admin | Stats, members by country, verification, reports, program rules, all placements. |
| Ambassadors | Admins add ambassadors with a fixed referral code (Admin → Ambassadors). People join with their link `pairmundo.com/?ref=CODE` (the website remembers it and shows who invited them) or type the code at sign-up in the app or on the website. Rewards are recorded once per person as they happen: a completed au pair profile (€2, up to €100 a month per ambassador), 25% of a family's first paid Family Pass, and €40 per referred side when a stay starts (`AMBASSADOR_REWARDS` in `server/app.js`). Admins see each ambassador's numbers by month, download the payout sheet as CSV, and mark rewards paid. Linking an ambassador to their own account shows them their link and numbers under Account and safety. |
| Notifications | In-app for requests, placements, reviews and verification. |

## Important caveat on program data

The figures in `server/programs.js` are indicative (reviewed Oct 2026) and change often, especially pocket money minimums. Check every figure against the linked official source before relying on it, and keep them current in the admin's Program rules tab.

## Layout

```
server/  app.js (API), db.js (schema), auth.js, matching.js (score + compliance), programs.js (country rules, review criteria, checklist), portraits.js (demo art), seed.js
public/  index.html, app.js (single-page client, no build step), styles.css
test/    api.test.js (end-to-end API flow + unit tests)
```

## Next steps for production

Push notifications, photo moderation and object storage (S3 or similar) for uploads, ID document upload with a real ID-verification provider, payments for agency fees, video calls, translations of the interface, Postgres for multi-instance hosting, and WebSockets for messaging.
