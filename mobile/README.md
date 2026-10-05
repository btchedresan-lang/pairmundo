# PairMundo mobile app

The iPhone and Android app for PairMundo, built with Expo (React Native). It talks to the same API as the web app in `../server`.

What's in it: swipe deck (drag right to like, left to pass, up to super like), "It's a match!" screen, likes, matches and chat, your profile with photo upload from the phone, placements with the checklist and reviews, and the country au pair rules. Admin and moderation tools stay on the web app.

## Try it on your phone with Expo Go

You need a computer with Node 20 or newer, and the phone on the **same Wi-Fi** as the computer.

1. Start the API on the computer:
   ```bash
   cd server
   npm install
   npm run seed      # demo data, optional
   npm start         # http://localhost:3000
   ```
2. Start the app in a second terminal:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
3. Install **Expo Go** from the App Store or Google Play.
4. Scan the QR code shown in the terminal: with the iPhone Camera app, or from inside Expo Go on Android.

The app finds the API automatically at your computer's address on port 3000. If it can't connect, tap **⚙ Server** on the sign-in screen and type the address, for example `http://192.168.1.20:3000`.

If the phone can't reach the computer (office or guest Wi-Fi often blocks this), run `npx expo start --tunnel` instead; then set the server address to a public URL for the API.

Demo accounts (password `password123`), also one tap on the sign-in screen:

| Account | Email |
| --- | --- |
| Host family | millers@aupair.test |
| Au pair | maria@aupair.test |

Other options: press `w` in the Expo terminal for a browser preview, or `i` / `a` for the iOS Simulator or Android emulator if you have them installed.

## Renaming the app

The app is called **PairMundo** (it was AuPair Connect until 2026-10-05, when we found another app using that name). The name and store identifiers live in one place, **`brand.json`**:

```json
{ "name": "PairMundo", "slug": "pairmundo", "scheme": "pairmundo",
  "bundleId": "com.pairmundo.app", "tagline": "...", "primary": "#fd3a73", "primaryDark": "#ff6036" }
```

Change `name` (what people see), `slug`, `scheme` and `bundleId` (store identifiers, e.g. `com.yourcompany.yourapp`), and the colours if you like. The app icon and splash image are in `assets/`.

## Publishing to the App Store and Google Play

1. Host the API somewhere public with HTTPS (any Node host with a persistent disk for `data/`).
2. Set `EXPO_PUBLIC_API_URL=https://api.yourdomain.com` when building, so the app points at it.
3. Build with EAS: `npx eas-cli build --platform all` (needs a free Expo account, an Apple Developer account and a Google Play developer account), then `npx eas-cli submit`.

## Developing

- `CI=1 npx expo lint` runs the linter.
- Screens are in `src/app` (Expo Router: one file per screen), shared pieces in `src/components`, API calls in `src/api.js`.
- Add native packages with `npx expo install <name>` so versions match the Expo SDK.
