---
name: regression
description: Run the storefront regression test — load every key page on the First Cup dev theme and the live theme at desktop and mobile width, run the click-through interaction checks, and report anything dev does worse than live. Use when the user says "run a regression", "regression test", "test dev against live", "is dev safe to go live", or passes page paths to check.
---

# Regression test: dev theme vs live

Compares the **dev** theme against the **live** theme in headless Chrome. Read-only — it never pushes, edits theme files, or changes store data (cart adds happen in a throwaway browser profile).

Arguments (optional): page paths to limit the run, e.g. `/regression /pages/locations /products/trigger`. With no arguments, run the full page list in `qa/scripts/regress.mjs`.

## Steps

### 1. Resolve theme IDs

IDs rotate whenever dev gets published, so never trust a remembered one:

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd theme-dev && shopify theme list --store=first-cup-coffee-co.myshopify.com
```

Dev is `first-cup-coffee-benny-dev`; live is the row marked `[live]`. If either is missing, stop and say so.

### 2. Page loads on both themes

Put results in the session scratchpad (not `/tmp`). Run dev and live in parallel — each script launches its own Chrome. For a limited run, prefix both with `ONLY=/path1,/path2`.

```bash
cd qa/scripts
node regress.mjs <DEV_ID> dev "<scratchpad>/reg-dev.json"
node regress.mjs <LIVE_ID> live "<scratchpad>/reg-live.json"
```

A full run is 28 pages × 2 viewports per theme and takes several minutes — give it a long timeout or run it in the background.

### 3. Interaction checks on both themes

Skip this for a limited `ONLY=` run unless the user asks.

```bash
node interact.mjs <DEV_ID> dev
node interact.mjs <LIVE_ID> live
```

Each prints one JSON line of check → result. A check only counts as a regression if it passes on live and fails on dev.

### 4. Compare

```bash
node compare.mjs "<scratchpad>/reg-dev.json" "<scratchpad>/reg-live.json"
```

It prints markdown: totals, then one row per page load listing anything new on dev (status change, JS error, failed request, broken image, overflow, missing header/footer, jQuery loaded twice). Exit code 1 means at least one new issue.

Before calling anything a regression, **re-run that page alone on both themes** (`ONLY=<path>`). Network drops (`ERR_INTERNET_DISCONNECTED`) and third-party flakiness have produced false failures before. Errors that also happen on live (e.g. the Omnisend `getSettings` fetch) are not regressions.

### 5. Report

Lead with the verdict: **PASS** (nothing new on dev) or **FAIL** with each new issue, the page, and the likely cause if you can tell from the diff since the last go-live.

For a full run, also write the report to `qa/<YYYY-MM-DD>-dev-theme-regression.md`, following the format of the existing report in `qa/` (header table with themes, branch and commit; what changed on dev; summary; page loads; interaction checks). Don't commit it unless asked.
