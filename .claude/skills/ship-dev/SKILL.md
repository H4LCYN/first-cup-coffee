---
name: ship-dev
description: Commit all uncommitted work and push it to the First Cup dev theme. Use when the user says "ship it", "commit and push", "push to dev", "deploy to dev", or otherwise asks to get current local changes onto the dev theme.
---

# Ship to dev theme

Commit everything outstanding, then push **only the changed files** to the **dev** theme. Never the live theme.

## Hard rules

- **Dev theme only.** `first-cup-coffee-benny-dev`. Never pass `--allow-live`. Never target the live theme unless the user explicitly asks for live in that same message.
- **Never push the whole directory.** `theme push` deletes remote files absent locally. Always scope with `--only=<path>` per file, or use `--nodelete`. This has wiped entire themes twice before.
- **Theme IDs change** (backups get promoted). Resolve the current ID with `shopify theme list` rather than trusting a remembered one. As of 2026-09-15 dev was `157059580126`.
- **`theme-live/` is never pushed** by this skill. Commit changes there if present, but say so and leave them local.

## Steps

### 1. Pre-flight

```bash
which shopify || echo "CLI MISSING"
```

If missing, the global install is broken — tell the user to run `npm install -g @shopify/cli@latest`, and stop. (A failed CLI auto-update has removed the binary before.)

Resolve the dev theme id:

```bash
cd theme-dev && shopify theme list
```

### 2. Review what's changing

```bash
git status --porcelain
git diff --stat
```

Read the actual diff for anything non-obvious. Specifically check:
- No secrets (`.env`, credentials, tokens) — stop and ask if any appear.
- Deletions are intentional. Renames show as delete+add; confirm the new file exists.
- Changes you didn't make. The user edits these files in their IDE in parallel; take their edits as current state, but flag anything that looks broken rather than reverting it.

### 3. Validate before committing

Malformed JSON and invalid Liquid have both shipped from here before. Always run:

```bash
cd theme-dev && python3 -c "
import re, json, glob
for p in ['templates/index.json', 'config/settings_data.json']:
    t = open(p, encoding='utf-8').read()
    json.loads(re.sub(r'^/\*.*?\*/\s*', '', t, flags=re.S))   # strip Shopify's comment header
    print(p, 'OK')
for f in glob.glob('sections/*.liquid'):
    s = open(f).read()
    m = re.search(r'{%\s*schema\s*%}(.*?){%\s*endschema\s*%}', s, re.S)
    if m:
        try: json.loads(m.group(1))
        except Exception as e: print('SCHEMA BAD:', f, e)
print('schemas checked')
"
```

Known pre-existing failure: `sections/section-location-grid.liquid` has a bad schema. Ignore it unless it's in the current diff.

Also grep for Liquid that parses locally but fails on Shopify:

```bash
grep -rn "assign.*==" theme-dev/sections/ || echo "clean"
```

`{% assign x = a == b %}` is **not** valid Liquid — inline the comparison into the `{% if %}` instead.

### 4. Check living files for remote drift

`templates/*.json` and `config/settings_data.json` are rewritten server-side whenever anyone touches the theme editor. If either is in the diff, compare against the server before pushing, or you'll silently clobber merchant-entered content (app blocks, section copy):

```bash
cd theme-dev && shopify theme pull --theme=<DEV_ID> --only=templates/index.json --path=/tmp/drift-check
diff /tmp/drift-check/templates/index.json templates/index.json
```

If the remote has content the local copy lacks, stop and ask how to reconcile. Do not push over it.

### 5. Commit

Stage `theme-dev` and `theme-live` explicitly (not `git add -A`). Write a real message describing the why, and end with the attribution line the session's system reminder specifies.

### 6. Push, scoped

Build the `--only` list from the files actually changed in the commit(s) being shipped:

```bash
cd "$(git rev-parse --show-toplevel)"
git diff --name-only <last_pushed_sha> HEAD -- theme-dev | sed 's#^theme-dev/##' > /tmp/push_files.txt
cd theme-dev
ONLY=$(sed 's/^/--only=/' /tmp/push_files.txt | tr '\n' ' ')
eval "shopify theme push --theme=<DEV_ID> $ONLY"
```

Include deleted paths in the list too — scoped delete-sync is how renames propagate.

If the push reports errors (it prints them but still says "pushed with errors"), **read them**. A Liquid syntax error means that file did not update; fix and re-push rather than assuming success.

### 7. Verify

```bash
shopify theme pull --theme=<DEV_ID> --path=/tmp/verify-push
diff <(cd /tmp/verify-push && find . -type f | sort) <(cd theme-dev && find . -type f | sort)
```

Then grep the pulled copy for a distinctive string from this change set to confirm it actually landed. Report the preview URL:
`https://first-cup-coffee-co.myshopify.com?preview_theme_id=<DEV_ID>`

Remote-only leftovers from earlier renames are expected and harmless; local-only files mean the push didn't take.
