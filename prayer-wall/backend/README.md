# First Cup Prayer Wall — backend

This is the one piece of custom code the Prayer Wall needs. Shopify can't let a
customer write to a metaobject from the storefront, so this small app exists
purely to handle the four actions that require an authenticated write:
submitting a request, praying/un-praying, self-deleting, and staging a
praise-report update. Everything else — reviewing and publishing — happens
directly in Shopify Admin's Content section, no app UI involved.

## What's here

- `app/routes/proxy.$.jsx` — the single endpoint (via Shopify App Proxy) that
  handles `submit`, `pray`, `delete`, and `update-praise`.
- `app/lib/metaobjects.server.js` — all reads/writes to the `prayer_request`
  metaobject.
- `app/lib/submission-limits.server.js` — the 5-active-request cap and
  24-hour cooldown.
- `app/lib/email.server.js` — sends you (prayer@firstcup.com) a link straight
  to the relevant Admin entry whenever something needs review.
- `app/routes/_index.jsx` — a one-line landing page; there's no real admin UI.

## One-time setup

1. **Create the app in your Partner Dashboard** (or via `shopify app config link`
   if you'd rather scaffold this into a full `shopify app init` project — this
   folder has the app code but not the full CLI project scaffolding like
   `.graphqlrc`, ESLint config, etc. Running `shopify app init` fresh and
   copying these files in is the cleanest path if you want the full toolchain).
2. Fill in `shopify.app.toml`: `client_id`, `application_url`, and the
   redirect URLs once you know where this will be hosted.
3. Copy `.env.example` to `.env` and fill in:
   - `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` (from the Partner Dashboard)
   - `RESEND_API_KEY` (sign up at resend.com — free tier is plenty for this
     volume) and `RESEND_FROM_EMAIL`
   - `MODERATOR_EMAIL` (prayer@firstcup.com)
4. `npm install`
5. `npx prisma migrate dev --name init` to create the local session-storage DB.
6. `shopify app deploy` to register the app config (scopes, webhooks, app
   proxy) with Shopify.
7. Deploy the app itself (Fly.io or Render both work fine for a Remix app —
   pick whichever you're more comfortable operating). Point `SHOPIFY_APP_URL`
   and the redirect URLs at the deployed URL, then re-run `shopify app deploy`.
8. Install the app on the First Cup store via the install link Shopify gives
   you after `shopify app deploy`. This is what grants it the Admin API scopes
   it needs (`read_customers`, `read_metaobjects`, `write_metaobjects`, plus
   the metaobject-definition scopes).

The `prayer_request` metaobject definition itself is already created — no
need to run any setup mutation for that.

## Local development

`npm run dev` runs `shopify app dev`, which tunnels your local server so
Shopify's App Proxy can reach it — useful for testing the submit/pray/delete
flow against a real (dev) store before deploying for real.

## Production database note

SQLite (`DATABASE_URL="file:./dev.sqlite"`) is fine for local dev, but most
hosts (Fly.io, Render) want a real Postgres database for anything persistent
in production — session storage would otherwise get wiped on every deploy.
Swap the `datasource` in `prisma/schema.prisma` to `postgresql` and point
`DATABASE_URL` at a managed Postgres instance before going live.
