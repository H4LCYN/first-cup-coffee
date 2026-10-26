# Regression report: dev theme vs live, 2026-10-26

**Result: PASS. No regressions found. The dev theme is cleared to go live.**

| | |
|---|---|
| Tested | `first-cup-coffee-benny-dev` #159869010142 (dev) |
| Baseline | `first-cup-coffee-live-10-23` #157059580126 (live) |
| Store | first-cup-coffee-co.myshopify.com |
| Branch | `nav-2026-design` (theme code at 1bb86f4) |
| Method | Headless Chrome via the DevTools protocol, cache disabled, real mouse input for interactions |
| Viewports | Desktop 1420×900, mobile 390×844 (touch emulation) |

## What changed on dev

- **Header (2026 Figma nav design):** red strip with the promo message plus Sign In / Create an Account. 80px nav in Roboto. COFFEE is now a plain link to `/collections/coffee`, with the mega menu removed. Gold JOIN THE CLUB links to `/pages/subscribe-save`. FEATURED BLEND links to a product picker that currently resolves to Trigger Fuel. PRAY FIRST links to `/pages/prayer-wall`.
- **Performance:** woff2 fonts with otf/ttf fallbacks; Swiper self-hosted; the Material Symbols font is replaced by an inline SVG; image loading is tuned; jQuery and the Webflow JS are no longer loaded twice; the broken `megaBack()` script is removed.
- **Prayer Wall:** the permanent "Subscribe or order…" guest toast is removed.

## Summary

| Check | Dev | Live |
|---|---|---|
| Page loads tested | 56 (28 pages × 2 viewports) | 56 |
| HTTP status differences | none | |
| JavaScript errors, all loads | **73** | 135 |
| New JS errors on dev | **0** | |
| New failed requests or missing assets on dev | **0** | |
| Broken images | 0 | 0 |
| Horizontal overflow on mobile | 0 pages | 0 pages |
| Interaction checks passed | 10 / 10 | 10 / 10 |

## Page loads

Every page loaded at both widths on both themes. "New issues" means a JS error, failed request, broken image or overflow that happens on dev but not on live.

| Page | Status | JS errors desktop (dev / live) | JS errors mobile (dev / live) | New issues on dev |
|---|---|---|---|---|
| `/` | 200 | 1 / 2 | 1 / 2 | None |
| `/collections/coffee` | 200 | 1 / 2 | 1 / 2 | None |
| `/collections/all` | 200 | 1 / 2 | 1 / 2 | None |
| `/collections/merch` | 200 | 1 / 2 | 1 / 2 | None |
| `/collections/5lb-bags` | 200 | 0 / 2 | 1 / 2 | None |
| `/collections/best-sellers` | 200 | 0 / 1 | 1 / 2 | None |
| `/products/trigger` | 200 | 1 / 2 | 1 / 2 | None |
| `/products/trigger-fuel-5-lb-bag` | 200 | 1 / 2 | 1 / 2 | None |
| `/products/trigger-fuel-pods-24-count` | 200 | 0 / 1 | 1 / 2 | None |
| `/products/the-carver` | 200 | 3 / 4 | 3 / 4 | None |
| `/products/the-carver-pods` | 200 | 3 / 9 | 3 / 4 | None |
| `/products/the-carver-5-lb-bag` | 200 | 3 / 4 | 3 / 4 | None |
| `/products/medium-roast-bundle` | 200 | 2 / 3 | 2 / 3 | None |
| `/products/test-product` | 200 | 1 / 2 | 1 / 2 | None |
| `/pages/subscribe-save` | 200 | 1 / 2 | 1 / 2 | None |
| `/pages/locations` | 200 | 1 / 2 | 1 / 2 | None |
| `/pages/rosenberg-location` | 200 | 2 / 3 | 2 / 3 | None |
| `/pages/woodlands-location` | 200 | 2 / 3 | 2 / 3 | None |
| `/pages/pearland-location` | 200 | 2 / 3 | 2 / 3 | None |
| `/pages/prayer-wall` | 200 | 1 / 2 | 1 / 2 | None |
| `/pages/contact` | 200 | 1 / 2 | 1 / 2 | None |
| `/pages/follow` | 200 | 1 / 2 | 1 / 2 | None |
| `/pages/room-rentals` | 200 | 1 / 2 | 1 / 2 | None |
| `/pages/faq` | 200 | 1 / 2 | 1 / 2 | None |
| `/blogs/news` | 404 | 1 / 2 | 1 / 2 | None (404 on live too; no blog exists) |
| `/cart` | 200 | 1 / 2 | 1 / 2 | None |
| `/search?q=coffee` | 200 | 1 / 2 | 1 / 2 | None |
| `/this-page-does-not-exist` | 404 | 1 / 2 | 1 / 2 | None (expected 404) |

The first run of `/products/the-carver` on desktop was invalid because the test machine's network dropped mid-load (`ERR_INTERNET_DISCONNECTED`). Its row comes from two clean re-runs on both themes, which gave the same result both times.

## Interaction checks

Real mouse clicks; each result was the same on both themes.

| Check | Dev | Live |
|---|---|---|
| Search opens from the nav icon | Pass | Pass |
| Cart drawer opens | Pass | Pass |
| Add to cart, The Carver (standard product form) | Pass (0 → 1) | Pass (0 → 1) |
| Trigger Fuel buy box renders | Pass | Pass |
| Add to cart, Trigger Fuel buy box | Pass (1 → 2) | Pass (1 → 2) |
| Prayer Wall loads request cards | Pass (8 shown) | Pass (8 shown) |
| Prayer Wall "Request Prayer" opens the form | Pass | Pass |
| Mobile hamburger menu opens | Pass | Pass |
| Mobile menu shows COFFEE / LOCATIONS / MERCH / JOIN THE CLUB | Pass | n/a (old menu) |
| Nav links resolve to the right URLs (below) | Pass | n/a |

Nav links on dev: COFFEE → `/collections/coffee`, LOCATIONS → `/pages/locations`, MERCH → `/collections/merch`, JOIN THE CLUB → `/pages/subscribe-save`, FEATURED BLEND → `/products/trigger`, PRAY FIRST → `/pages/prayer-wall`.

## Errors fixed by dev

These appear on live and are gone on dev:

- `SyntaxError: Unexpected token ')'` (the broken `megaBack()` script)
- `TypeError: Webflow.require is not a function` / `window.Webflow.require is not a function`
- `ReferenceError: $ is not defined`
- `ReferenceError: recharge is not defined`
- `TypeError: u is not a function`

## Known issues (same on live, not caused by this release)

| Issue | Where | Notes |
|---|---|---|
| Omnisend `getSettings` request fails (`ERR_FAILED`), causing `TypeError: Failed to fetch` | Every page | Third-party app; check the Omnisend app connection. |
| `Google Maps JavaScript API error: BillingNotEnabledMapError` | Location pages | Maps embeds need billing enabled on the Google Cloud project. |
| `404 …/assets/main.js` | 6 page loads | The theme references an asset that doesn't exist. |
| `Missing necessary data for Add to Cart!` (Recharge subscription form) | Standard product pages | Console warning from the Webflow/Recharge form; add to cart still works. |
| `SyntaxError: … is not valid JSON` | Standard product pages | Webflow commerce script parsing; pre-existing. |
| Contact page has no red top strip | `/pages/contact` | That template never included the `top-ad` section. |
| 404 page has no nav | 404 template | That template never included the `navbar` section. |
| `/blogs/news` returns 404 | Blog | No blog exists, but it's still in the sitemap. |

## Release readiness

- **Content files are identical** on live and dev (`templates/*.json`, `config/settings_data.json`), so going live won't overwrite anything set in the theme editor.
- **Code difference:** 45 changed files and 31 new assets (woff2 fonts, Swiper). Live has nothing that dev lacks, apart from the removed `megaBack()` script and Prayer Wall toast.
- **Go-live plan:**
  1. Duplicate the live theme as a rollback copy.
  2. Push only those 76 files to live with deletions turned off.
  3. Pull live back to confirm every file landed.
  4. Re-run this suite against live.
- **Not covered by this release:** the Prayer Wall backend deploy (missing card titles, guest posting) is separate and still pending.
- **Not tested:** checkout, logged-in customer flows, the theme editor and real devices. Mobile was tested with Chrome device emulation.

## Re-running

Scripts are in [`qa/scripts/`](scripts/). They need Google Chrome and Node 22+.

```sh
# Page loads (writes JSON results; progress goes to stderr)
node qa/scripts/regress.mjs <themeId> <label> <out.json>
# Interaction checks (prints one JSON line)
node qa/scripts/interact.mjs <themeId> <label>
```

Run each script once against the theme being released and once against live, then compare the two. Get theme IDs from `shopify theme list --store=first-cup-coffee-co.myshopify.com`, because they change whenever a theme is published.
