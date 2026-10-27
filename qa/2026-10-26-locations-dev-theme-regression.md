# Regression report: dev theme vs live, 2026-10-26 (locations rebuild)

**Result: PASS. No regressions found. The dev theme is cleared to go live.**

| | |
|---|---|
| Tested | `first-cup-coffee-benny-dev` #159869010142 (dev) |
| Baseline | `first-cup-coffee-live-10-23` #157059580126 (live) |
| Store | first-cup-coffee-co.myshopify.com |
| Branch | `nav-2026-design` (theme code at 83f388b) |
| Method | Headless Chrome via the DevTools protocol, cache disabled, real mouse input for interactions (`/regression`) |
| Viewports | Desktop 1420×900, mobile 390×844 (touch emulation) |

## What changed on dev since the last go-live

- **Locations page and the three location pages** (Pearland, Rosenberg, Woodlands) rebuilt from the 2026 Figma designs as JSON templates, using the new `section-page-hero`, `section-split-cta` and `section-location-info` sections. Location maps now use the Google Maps Embed API, searched by address.
- **JOMO partner product templates** (`product.jomo*.json`) and their mobile padding fixes. These products are still drafts, so they aren't in the page list.

## Summary

| Check | Dev | Live |
|---|---|---|
| Page loads tested | 56 (28 pages × 2 viewports) | 56 |
| HTTP status differences | none | |
| JavaScript errors, all loads | **70** | 76 |
| New JS errors on dev | **0** | |
| Failed requests, all loads | 56 | 62 |
| New failed requests or missing assets on dev | **0** | |
| Broken images | 0 | 0 |
| Horizontal overflow on mobile | 0 pages | 0 pages |
| Interaction checks passed | 9 / 9 | 9 / 9 |

The one JS error and one failed request left on nearly every page, on both themes, is Omnisend's `getSettings` fetch (`wt.omnisendlink.com`). It's third-party and not caused by the theme.

## Fixed on dev

The live location pages currently log two errors that dev no longer has:

- `Google Maps JavaScript API error: BillingNotEnabledMapError`. The old styled map uses the Maps JavaScript API, which needs billing on the key's Google Cloud project, so **the map on the live location pages is broken today**. Dev's Embed API map loads with the same key.
- `404 …/assets/main.js`. The old location map section requests a `main.js` that doesn't exist in the theme.

## Page loads

Every page loaded at both widths on both themes. "New issues" means a JS error, failed request, broken image or overflow that happens on dev but not on live.

| Page | Status | JS errors desktop (dev / live) | JS errors mobile (dev / live) | New issues on dev |
|---|---|---|---|---|
| `/` | 200 | 1 / 1 | 1 / 1 | None |
| `/collections/coffee` | 200 | 1 / 1 | 1 / 1 | None |
| `/collections/all` | 200 | 1 / 1 | 1 / 1 | None |
| `/collections/merch` | 200 | 1 / 1 | 1 / 1 | None |
| `/collections/5lb-bags` | 200 | 1 / 1 | 1 / 1 | None |
| `/collections/best-sellers` | 200 | 1 / 1 | 1 / 1 | None |
| `/products/trigger` | 200 | 1 / 1 | 1 / 1 | None |
| `/products/trigger-fuel-5-lb-bag` | 200 | 1 / 1 | 1 / 1 | None |
| `/products/trigger-fuel-pods-24-count` | 200 | 1 / 1 | 1 / 1 | None |
| `/products/the-carver` | 200 | 3 / 3 | 3 / 3 | None |
| `/products/the-carver-pods` | 200 | 3 / 3 | 3 / 3 | None |
| `/products/the-carver-5-lb-bag` | 200 | 3 / 3 | 3 / 3 | None |
| `/products/medium-roast-bundle` | 200 | 2 / 2 | 2 / 2 | None |
| `/products/test-product` | 200 | 1 / 1 | 1 / 1 | None |
| `/pages/subscribe-save` | 200 | 1 / 1 | 1 / 1 | None |
| `/pages/locations` | 200 | 1 / 1 | 1 / 1 | None |
| `/pages/rosenberg-location` | 200 | 1 / 2 | 1 / 2 | None (dev fixes live's map error and missing main.js) |
| `/pages/woodlands-location` | 200 | 1 / 2 | 1 / 2 | None (dev fixes live's map error and missing main.js) |
| `/pages/pearland-location` | 200 | 1 / 2 | 1 / 2 | None (dev fixes live's map error and missing main.js) |
| `/pages/prayer-wall` | 200 | 1 / 1 | 1 / 1 | None |
| `/pages/contact` | 200 | 1 / 1 | 1 / 1 | None |
| `/pages/follow` | 200 | 1 / 1 | 1 / 1 | None |
| `/pages/room-rentals` | 200 | 1 / 1 | 1 / 1 | None |
| `/pages/faq` | 200 | 1 / 1 | 1 / 1 | None |
| `/blogs/news` | 404 | 1 / 1 | 1 / 1 | None (404 on live too; no blog exists) |
| `/cart` | 200 | 1 / 1 | 1 / 1 | None |
| `/search?q=coffee` | 200 | 1 / 1 | 1 / 1 | None |
| `/this-page-does-not-exist` | 404 | 1 / 1 | 1 / 1 | None (expected 404) |

## Interaction checks

Real mouse clicks; each result was the same on both themes.

| Check | Dev | Live |
|---|---|---|
| Search opens from the nav icon | Pass | Pass |
| Cart drawer opens | Pass | Pass |
| Nav links | 4 | 4 |
| Add to cart, The Carver (standard product form) | Pass (0 → 1) | Pass (0 → 1) |
| Trigger Fuel buy box renders | Pass | Pass |
| Add to cart, Trigger Fuel buy box | Pass (1 → 2) | Pass (1 → 2) |
| Prayer Wall shows prayer cards | Pass (8) | Pass (8) |
| Prayer Wall "Request Prayer" opens the form | Pass | Pass |
| Mobile menu opens | Pass | Pass |

## Before going live

The live theme still has `templates/page.locations.liquid`, `page.location.liquid`, `page.location-rosenberg.liquid` and `page.location-woodlands.liquid`. Shopify won't keep a `.liquid` and a `.json` template with the same name, so the go-live push must delete those four in the same push that uploads the new `.json` templates.
