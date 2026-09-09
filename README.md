# First Cup Coffee — Theme Project

## Structure

- `theme-dev/` — local mirror of the dev theme (`first-cup-coffee-benny-dev`). All active theme work happens here.
- `theme-live/` — local mirror of the live theme. Reference only; do not push here without explicit sign-off.
- `prayer-wall/` — Remix backend app, metaobject setup scripts, and docs for the Prayer Wall feature.

Theme IDs change over time (backups get promoted, etc.) — always confirm the current dev/live theme IDs with `shopify theme list` rather than trusting a remembered ID.

## Critical rules before pushing a theme

1. **Never push to the live theme without the user explicitly asking for it.** Default target is the dev theme.

2. **Never run `shopify theme push` from a directory that doesn't hold the full theme.** By default, `theme push` mirrors your local directory to the remote theme and deletes anything remote that isn't present locally. Pushing from a scratchpad with a handful of staged files has wiped out entire themes before (twice, in one day). Always either:
   - run from a directory with the complete theme, or
   - scope the push with `--only=<path>` for each file you intend to touch, or
   - add `--nodelete` to disable delete-sync entirely.

3. **`templates/*.json` and `config/settings_data.json` are *living* files.** Shopify rewrites them directly on its servers whenever someone adds an app block or edits section settings through the theme editor. Our local copies are only snapshots from whenever we last pulled. Before editing either file (adding/removing a section, reordering, etc.), **pull it fresh first**, make the specific edit on top of that fresh copy, then push immediately. Editing a stale local copy will silently overwrite real merchant-configured content (app blocks, section text) that only exists on the live server. This has already happened once — see git history around `templates/index.json`.

## Homepage architecture

`templates/index.liquid` was converted to `templates/index.json` (a real OS 2.0 JSON template) specifically so Shopify app blocks (`"type": "@app"`) can be added to homepage sections — app blocks are not supported in sections rendered via the `{% section %}` Liquid tag inside a `.liquid` template, only in JSON templates/section groups.
