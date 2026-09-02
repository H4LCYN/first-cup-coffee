#!/usr/bin/env node
/**
 * One-shot OAuth token capture.
 * 1. Expose this with: npx localtunnel --port 3000
 * 2. Add the tunnel URL + /callback as a redirect URI in your Partners app
 * 3. Visit the authorize URL printed below in your browser (must be logged into the store)
 * 4. Token is printed and server shuts down.
 *
 * Required env vars:
 *   SHOPIFY_API_KEY      — client_id from Partners app
 *   SHOPIFY_API_SECRET   — client_secret from Partners app
 *   SHOPIFY_STORE_DOMAIN — e.g. first-cup-coffee-co.myshopify.com
 *   REDIRECT_URI         — the tunnel URL + /callback, e.g. https://abc.loca.lt/callback
 */

import http from "http";
import { createHash, randomBytes } from "crypto";

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_STORE_DOMAIN, REDIRECT_URI } = process.env;

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_STORE_DOMAIN || !REDIRECT_URI) {
  console.error("Missing env vars: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_STORE_DOMAIN, REDIRECT_URI");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const scope = "write_metaobjects";

const authorizeUrl =
  `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/authorize` +
  `?client_id=${SHOPIFY_API_KEY}` +
  `&scope=${scope}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${state}`;

console.log("\nVisit this URL in your browser (must be logged into the store):\n");
console.log(authorizeUrl);
console.log("\nWaiting for OAuth callback...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (returnedState !== state) {
    res.writeHead(400);
    res.end("State mismatch — possible CSRF");
    return;
  }

  const tokenRes = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    }
  );

  const { access_token, error } = await tokenRes.json();

  if (error || !access_token) {
    res.writeHead(500);
    res.end(`Token exchange failed: ${JSON.stringify({ error })}`);
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Token captured. Check your terminal.");

  console.log("\n✓ Access token:\n");
  console.log(access_token);
  console.log("\nCopy this into SHOPIFY_ADMIN_TOKEN when running create-metaobject-definition.mjs\n");

  server.close();
});

server.listen(3000, () => {
  console.log("Listening on http://localhost:3000");
});
