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

## Photo storage

Until it is set up, photos are kept on the Render disk, which is fine for a start (1 GB holds a few thousand photos). For backups and room to grow, use Cloudflare R2 (10 GB free):

1. In the [Cloudflare dashboard](https://dash.cloudflare.com), open **R2**, and create a bucket called `pairmundo-photos`.
2. In the bucket's **Settings** → **Public access**, connect a custom domain such as `photos.pairmundo.com` (this needs the domain on Cloudflare), or for testing turn on the `r2.dev` address.
3. In **R2** → **Manage API tokens**, create a token with **Object Read & Write** on that bucket. Copy the access key ID, the secret access key and the endpoint (`https://<account id>.r2.cloudflarestorage.com`).
4. In Render → **Environment**, set `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_URL` (the public address from step 2, for example `https://photos.pairmundo.com`), then save.

New photos then go to R2. Photos uploaded before stay on the disk and keep working.

## Photo check

Each uploaded profile photo can be checked automatically by Claude (Anthropic) before it goes live. Clear violations (nudity, sexual content, gore, hate symbols) and any photo showing a child are refused with a message asking for a different photo. Unclear cases go live and appear in Admin → Reports for you to decide. It stays off until the key is set:

1. Create an account at [console.anthropic.com](https://console.anthropic.com), add a payment method, and create an API key under **API keys**.
2. In Render → **Environment**, set `ANTHROPIC_API_KEY` to the key, then save.

Each check costs a fraction of a cent. `MODERATION_MODEL` can name a different Claude model. If the check can't be reached, photos are allowed and the error shows in the logs.

## Database backups

Accounts, matches and messages live in one SQLite file on the Render disk. With backups on, the server copies it to a private R2 bucket every night and keeps the last 30 days (`backups/pairmundo-YYYY-MM-DD.db.gz`).

1. In Cloudflare **R2**, create a second bucket called `pairmundo-backups`. Leave its public access **off**. The photo bucket is public, so backups must not go there.
2. In **R2** → **Manage API tokens**, edit the `pairmundo-server` token so it can also read and write `pairmundo-backups`. (Or create a new token covering both buckets and put its keys in `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`.)
3. In Render → **Environment**, set `BACKUP_BUCKET` to `pairmundo-backups`, then save.

Admin → Overview shows the last backup and has a **Back up now** button. The first backup runs a minute after each start-up, then once a day.

To restore: download a backup from the bucket in Cloudflare, unzip it (`gunzip pairmundo-2026-10-06.db.gz`), stop the service, replace the database file on the disk (`/var/data/pairmundo.db`) with it using Render's Shell, delete any `pairmundo.db-wal` and `pairmundo.db-shm` files next to it, and start the service again.

## ID check

People can verify their passport or ID card with a selfie through Stripe Identity (about $1.50 per check). It stays off until these are set in Render → Environment:

- `STRIPE_SECRET_KEY`: from Stripe → Developers → API keys (the secret key, `sk_live_...`; use `sk_test_...` to try it without real checks).
- `STRIPE_WEBHOOK_SECRET`: in Stripe → Developers → Webhooks, add the endpoint `https://pairmundo.com/api/stripe/webhook` with the events `identity.verification_session.verified`, `identity.verification_session.requires_input` and `identity.verification_session.canceled`, then copy its signing secret (`whsec_...`). Without it, the app still picks up the result when the person reopens Account and safety.

Stripe asks you to activate Identity once (Stripe → Identity) before live checks work.

## Family Pass

Families pay €79 once for 90 days of messaging and seeing who liked them; au pairs stay free. Two switches in Render → Environment:

- `FAMILY_PASS` = `on` makes families need the pass. Leave it out and everything stays free.
- Payment on the website uses the same `STRIPE_SECRET_KEY` as the ID check. Add the event `checkout.session.completed` to the same Stripe webhook so a pass starts even if someone closes the page after paying.

- In the iPhone and Android apps, families pay with Apple or Google through RevenueCat (free until $2,500 a month in sales):
  1. In App Store Connect and Google Play Console, create a one-off (consumable) in-app product with the ID `family_pass_90`.
  2. In RevenueCat, add both apps and the product. Copy the public SDK keys (`appl_...` and `goog_...`) into `mobile/brand.json` as `revenuecatIos` and `revenuecatAndroid`.
  3. In Render, set `REVENUECAT_SECRET_KEY` (RevenueCat → API keys, a secret key starting `sk_`).
  4. In RevenueCat → Integrations → Webhooks, add `https://pairmundo.com/api/revenuecat/webhook` and type any long password as the Authorization header; put the same password in Render as `REVENUECAT_WEBHOOK_AUTH`. Refunds then end the pass too.
  In-app purchase only works in a store build (`eas build`), not in Expo Go.

Turn on payments first, then `FAMILY_PASS`, so families are never locked out with no way to pay. An admin can also give a family free days from the admin page.

## Pointing the phone app at the live server

Build the app with `EXPO_PUBLIC_API_URL=https://your-render-address` (or `https://api.pairmundo.com` once the domain is set up). See `mobile/README.md`.
