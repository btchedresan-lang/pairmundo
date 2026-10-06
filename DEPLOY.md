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

## ID check

People can verify their passport or ID card with a selfie through Stripe Identity (about $1.50 per check). It stays off until these are set in Render → Environment:

- `STRIPE_SECRET_KEY`: from Stripe → Developers → API keys (the secret key, `sk_live_...`; use `sk_test_...` to try it without real checks).
- `STRIPE_WEBHOOK_SECRET`: in Stripe → Developers → Webhooks, add the endpoint `https://pairmundo.com/api/stripe/webhook` with the events `identity.verification_session.verified`, `identity.verification_session.requires_input` and `identity.verification_session.canceled`, then copy its signing secret (`whsec_...`). Without it, the app still picks up the result when the person reopens Account and safety.

Stripe asks you to activate Identity once (Stripe → Identity) before live checks work.

## Family Pass

Families pay €79 once for 90 days of messaging and seeing who liked them; au pairs stay free. Two switches in Render → Environment:

- `FAMILY_PASS` = `on` makes families need the pass. Leave it out and everything stays free.
- Payment on the website uses the same `STRIPE_SECRET_KEY` as the ID check. Add the event `checkout.session.completed` to the same Stripe webhook so a pass starts even if someone closes the page after paying.

Turn on payments first, then `FAMILY_PASS`, so families are never locked out with no way to pay. An admin can also give a family free days from the admin page.

## Pointing the phone app at the live server

Build the app with `EXPO_PUBLIC_API_URL=https://your-render-address` (or `https://api.pairmundo.com` once the domain is set up). See `mobile/README.md`.
