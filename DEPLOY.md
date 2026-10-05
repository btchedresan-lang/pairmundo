# Putting PairMundo online (Render)

The server (API + website) runs on [Render](https://render.com) using the `render.yaml` file in this repository.

## First time

1. In Render, click **New** → **Blueprint** and connect the `pairmundo` GitHub repository.
2. Render reads `render.yaml` and asks for four values:
   - `ADMIN_EMAIL`: your email, for the admin account (moderation, verification badges, country rules).
   - `ADMIN_PASSWORD`: a strong password, at least 12 characters.
   - `RESEND_API_KEY` and `MAIL_FROM`: leave empty for now. Until they are set, verification and reset codes appear in Render's **Logs** tab instead of being emailed.
3. Click **Apply**. The first deploy takes a few minutes. The site is then live at `https://pairmundo.onrender.com` (or similar; Render shows the address).

Cost: the `starter` plan plus a 1 GB disk, which keeps the database and photos safe between deploys. Check Render's pricing page for current prices.

## After that

Every change pushed to `main` deploys automatically.

## Your own domain

In the Render service, open **Settings** → **Custom Domains**, add `pairmundo.com` (and `www.pairmundo.com`), and copy the DNS records Render shows into your domain seller's DNS settings. HTTPS is set up automatically.

## Real emails

1. Create a free account at [resend.com](https://resend.com) and add `pairmundo.com` as a domain (it shows DNS records to add, like above).
2. Create an API key.
3. In Render → **Environment**, set `RESEND_API_KEY` to the key and `MAIL_FROM` to `PairMundo <hello@pairmundo.com>`, then save.

## Pointing the phone app at the live server

Build the app with `EXPO_PUBLIC_API_URL=https://your-render-address` (or `https://api.pairmundo.com` once the domain is set up). See `mobile/README.md`.
