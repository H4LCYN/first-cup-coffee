# Regression report: dev theme vs live, 2026-10-26 (locations rebuild + Featured Blend link)

**Result: PASS. No regressions found. The dev theme is cleared to go live.**

| | |
|---|---|
| Tested | `first-cup-coffee-benny-dev` #159869010142 (dev) |
| Baseline | `first-cup-coffee-live-10-23` #157059580126 (live) |
| Store | first-cup-coffee-co.myshopify.com |
| Branch | `nav-2026-design` (theme code at 64928aa) |
| Method | Headless Chrome via the DevTools protocol, cache disabled, real mouse input for interactions (`/regression`) |
| Viewports | Desktop 1420×900, mobile 390×844 (touch emulation) |

## What changed on dev since the last go-live

- **Locations page and the three location pages** (Pearland, Rosenberg, Woodlands) rebuilt from the 2026 Figma designs as JSON templates, using the new `section-page-hero`, `section-split-cta` and `section-location-info` sections. Location maps now use the Google Maps Embed API, searched by address.
- **Featured Blend nav link** now goes to `/collections/featured-blends` (6 products) instead of `/products/trigger`. The theme editor's product picker is replaced by a link setting.
- **JOMO partner product templates** (`product.jomo*.json`) and their mobile padding fixes. These products are still drafts, so they aren't in the page list.

## Summary

| Check | Dev | Live |
|---|---|---|
| Page loads tested | 56 (28 pages × 2 viewports), plus `/collections/featured-blends` | 56 |
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
| `/collections/featured-blends` (extra, new nav target) | 200 | 1 / 1 | 1 / 1 | None |

## Interaction checks

Real mouse clicks; each result was the same on both themes.

| Check | Dev | Live |
|---|---|---|
| Search opens from the nav icon | Pass | Pass |
| Cart drawer opens | Pass | Pass |
| Nav links | 4 | 4 |
| Featured Blend link | `/collections/featured-blends` | `/products/trigger` |
| Add to cart, The Carver (standard product form) | Pass (0 → 1) | Pass (0 → 1) |
| Trigger Fuel buy box renders | Pass | Pass |
| Add to cart, Trigger Fuel buy box | Pass (1 → 2) | Pass (1 → 2) |
| Prayer Wall shows prayer cards | Pass (8) | Pass (8) |
| Prayer Wall "Request Prayer" opens the form | Pass | Pass |
| Mobile menu opens | Pass | Pass |

## Before going live

The live theme still has `templates/page.locations.liquid`, `page.location.liquid`, `page.location-rosenberg.liquid` and `page.location-woodlands.liquid`. Shopify won't keep a `.liquid` and a `.json` template with the same name, so the go-live push must delete those four in the same push that uploads the new `.json` templates.

## Go-live record (2026-10-26, evening)

1. **Rollback copy:** live was duplicated as `rollback-live-2026-10-26-pre-locations` **#159947292894**. Shopify fills a duplicate in the background, so it took several pulls to reach all 329 files. Once complete, every file matched live except `settings_data.json`, where Shopify dropped 15 old navbar settings that the current navbar code no longer declares (leftover mega-menu links). Nothing reads them. To roll back, publish that theme.
2. **Recheck:** live was re-pulled just before the push and hadn't changed since the comparison.
3. **Push:** from a fresh pull of dev #159869010142 (commit 64928aa) to live #157059580126, in three scoped pushes: 10 code files with deletions off; deletion of the 4 old `page.location*.liquid` templates; then the 4 new `page.location*.json` templates. Settings, existing templates and all other live files were left alone.
   - The first attempt silently changed nothing. In zsh an unquoted `$ONLY` isn't split into words, so all the `--only=` flags reached the CLI as one pattern that matched no file, and the CLI still reported success. The push was redone with each flag passed separately, checking the CLI's "Files to be uploaded" and "Files to be deleted" lists each time. `/go-live` now requires that check.
4. **Verified:** a full pull of live afterwards is byte-identical to the tested dev theme (337 files). The 4 old templates are gone.
5. **Production re-run** (new live vs the rollback as the before-release baseline):
   - All 56 page loads gave the expected status. No new JS errors, failed requests, broken images or overflow.
   - firstcup.com serves the new Locations page and all three location pages with their maps. Featured Blend links to `/collections/featured-blends`.
   - All interaction checks passed. In the first run, which shared the machine with two page-load runs, the Prayer Wall showed 0 cards. It passed on a standalone re-run on both live and the rollback, and its code wasn't part of this release.

## Go-live record (2026-10-27, BAFO)

1. **Regression gate:** a full `/regression` on dev at commit 3ca3b3a passed: 56 page loads with nothing new against live, and all 9 interaction checks. The three BAFO preview pages were also clean.
2. **Rollback copy:** live was duplicated as `rollback-live-2026-10-27-pre-bafo` **#159975276766**. Once it held all 337 files, every file matched live except `settings_data.json`, where Shopify dropped the same 15 old navbar settings as last time (none in the current navbar schema). To roll back, publish that theme.
3. **Push:** live was rechecked just before the push, and was unchanged. Two scoped pushes from a fresh dev pull: `sections/main-product-feature.liquid` and the three BAFO images with deletions off; then the three new templates `product.bafo{,-5lb,-pods}.json`. Nothing was deleted or held back, and no existing live content was touched. Each push's uploaded-file list was checked against the plan.
4. **Verified:** a full pull of live afterwards is byte-identical to the tested dev theme (343 files).
5. **Production re-run** (new live vs the rollback): all 56 page loads clean with no new issues, and all interaction checks passed. firstcup.com serves the BAFO backdrop layout with the Vimeo video on `?view=bafo` and `?view=bafo-pods`; Trigger Fuel still renders its default layout.
6. **Still to do:** assign the `bafo`, `bafo-5lb` and `bafo-pods` templates to the three Brew Around & Find Out products in admin. Until then customers see the old product page.

## Go-live record (2026-10-27, homepage roast card)

1. **Regression gate:** a full `/regression` on dev at commit 64bec0d passed: 56 page loads with nothing new against live, and all 9 interaction checks.
2. **Rollback copy:** live was duplicated as `rollback-live-2026-10-27-pre-roast-card` **#159976489182**. Once it held all 343 files, every file matched live except `settings_data.json`, where Shopify dropped the same 15 unused navbar settings. To roll back, publish that theme.
3. **Push:** live was rechecked just before the push, and was unchanged. One scoped push of `sections/home-cta-1.liquid` from a fresh dev pull, deletions off; the uploaded-file list named exactly that file. Nothing was deleted or held back.
4. **Verified:** a full pull of live afterwards is byte-identical to the tested dev theme (343 files).
5. **Production re-run** (new live vs the rollback): all 56 page loads clean with no new issues, and all interaction checks passed. The firstcup.com homepage shows the Featured Roast card with the BAFO backdrop and Nick Freitas on desktop.
