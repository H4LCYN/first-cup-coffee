---
name: go-live
description: Promote the tested First Cup dev theme's code to the live theme — back up live as a rollback theme, push only the files that differ, verify, and re-test production. Use only when the user explicitly asks to go live, release, promote dev to live, or runs /go-live.
---

# Go live: promote dev theme code to the live theme

This is the **only** workflow allowed to write to the live theme. It changes the real storefront, so it is deliberate and slow on purpose:

**back up → diff → confirm with the user → push → verify → re-test.**

The live theme stays published the whole time — files are pushed into it. Nothing is ever published or unpublished, except to roll back.

## Hard rules

- **Confirm before the push.** Invoking `/go-live` starts the process; it does not approve a file list nobody has seen. Show the exact plan (step 5) and wait for an explicit yes in this conversation.
- **Never push the whole directory.** Every push is scoped with `--only`. Use `--nodelete` everywhere except the targeted template-conflict deletions in step 7. Unscoped pushes have wiped whole themes twice.
- **Push the tested bytes.** The source is a fresh pull of the dev theme, not `theme-dev/` — local files may hold uncommitted or untested edits.
- **Live's content is the source of truth.** `config/settings_data.json` and any `templates/*.json` that already exist on live hold what's been set in the live theme editor. Don't overwrite them by default (step 4).
- **No rollback copy, no push.** Step 6 has to succeed first.
- **Resolve theme IDs fresh** with `shopify theme list`. They change whenever a theme is published.
- The CLI lives at `~/.nvm/versions/node/v22.22.2/bin`. Always pass `--store=first-cup-coffee-co.myshopify.com`. Work in the session scratchpad, not `/tmp`.

## Steps

### 1. Pre-flight

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd theme-dev && shopify theme list --store=first-cup-coffee-co.myshopify.com
git status --porcelain
```

- Dev is `first-cup-coffee-benny-dev`; live is the `[live]` row. Note both IDs.
- If there are uncommitted theme changes, stop and point at `/ship-dev`. What goes live must be committed and on dev.
- Shopify caps a store at 20 themes. If the list is near that, ask the user which old rollback themes to delete before continuing. Never delete one yourself without asking.

### 2. Regression gate

Dev must have a **PASS** from `/regression` for its current code: no theme code changed since the run, in git or on the dev theme. If there isn't one, run `/regression` now. On a FAIL, stop and report.

### 3. Pull both themes and diff

```bash
S=<scratchpad>
rm -rf "$S/golive" && mkdir -p "$S/golive/dev" "$S/golive/live"
shopify theme pull --store=first-cup-coffee-co.myshopify.com --theme=<DEV_ID>  --path="$S/golive/dev"
shopify theme pull --store=first-cup-coffee-co.myshopify.com --theme=<LIVE_ID> --path="$S/golive/live"
```

Then classify every file. Ignore `.shopify/` and `.DS_Store`:

```bash
python3 - "$S/golive" <<'EOF'
import sys, os, hashlib, json
root = sys.argv[1]
def files(d):
    out = {}
    for base, _, names in os.walk(d):
        if '.shopify' in base: continue
        for n in names:
            if n == '.DS_Store': continue
            p = os.path.join(base, n); out[os.path.relpath(p, d)] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    return out
dev, live = files(f'{root}/dev'), files(f'{root}/live')
content = lambda p: p == 'config/settings_data.json' or (p.startswith('templates/') and p.endswith('.json'))
plan = {'code_changed': [], 'code_new': [], 'content_new': [], 'content_changed': [], 'live_only': [], 'conflict_delete': []}
for p in sorted(dev):
    if p in live and dev[p] == live[p]: continue
    if content(p): plan['content_new' if p not in live else 'content_changed'].append(p)
    else: plan['code_new' if p not in live else 'code_changed'].append(p)
for p in sorted(set(live) - set(dev)):
    stem, ext = os.path.splitext(p)
    # A .liquid template replaced by a .json one on dev (or vice versa): Shopify won't keep both.
    if p.startswith('templates/') and ext in ('.liquid', '.json') and (stem + ('.json' if ext == '.liquid' else '.liquid')) in dev:
        plan['conflict_delete'].append(p)
    else:
        plan['live_only'].append(p)
json.dump(plan, open(f'{root}/plan.json', 'w'), indent=1)
for k, v in plan.items(): print(f'{k}: {len(v)}'); [print('   ', x) for x in v]
EOF
```

- **code_changed / code_new:** these get pushed.
- **content_new:** templates that don't exist on live yet (new page templates). Safe to push; they can't overwrite anything.
- **content_changed:** see step 4.
- **conflict_delete:** live `.liquid` templates that dev replaced with `.json` (or the reverse). They get deleted in step 7, otherwise the new template can't upload.
- **live_only:** files on live that dev doesn't have, usually leftover assets. **Leave them alone.** List them for the user, and if one looks like something live depends on (a snippet, a section in use), stop and ask.

### 4. Content files that already exist on live

For each **content_changed** file, diff live against dev and read it:

```bash
diff "$S/golive/live/<path>" "$S/golive/dev/<path>"
```

- If the live side has edits made in the live theme editor, **do not push the file.** Pushing would erase them. Tell the user what differs and suggest making the change in live's theme editor, or merging by hand: pull live, reapply the dev change on top, push that one file.
- If the only differences are a deliberate structural change from this release (a section added or removed in code) and live has no edits of its own, the file may go in the push. Only include it if the user approves it by name in step 5.
- For `config/settings_data.json`, compare the parsed JSON section by section (strip Shopify's `/* … */` header first) and list the keys that differ. A new static-section setting whose schema default is fine needs no push: the schema default applies.

### 5. Confirm with the user

Show the plan and stop until they answer:

- Theme IDs: dev → live, and the rollback name you'll create.
- Counts plus the full list: code files changing, new code files, new templates, live templates being deleted (and why), content files held back, live-only files left alone.
- Which commit is going live (`git log --oneline -1`) and the regression result it's backed by.

Use `AskUserQuestion` with "Go live" / "Cancel". Anything other than an explicit go-ahead means stop.

### 6. Rollback copy of live

```bash
shopify theme duplicate --store=first-cup-coffee-co.myshopify.com --theme=<LIVE_ID> \
  --name="rollback-live-<YYYY-MM-DD>-pre-<short-label>" --force --json
```

Note the new theme's ID. Pull it into `$S/golive/rollback` and confirm it hashes identical to `$S/golive/live`. If the duplicate failed or differs, stop.

- **Shopify fills a duplicate in the background.** The first pulls come back partial (29, then 117, 218… of 329 files on 2026-10-26). Re-pull until the file count matches live before comparing.
- **`config/settings_data.json` may differ.** The duplicate drops settings that no section's schema declares any more. Parse both copies and confirm that the only differences are dropped keys that aren't in the section's current schema. Anything else is a real difference: stop.

### 7. Push

First re-pull live and confirm it still matches `$S/golive/live`. If anyone edited live in the meantime, go back to step 3.

Then push **from the dev pull** (`$S/golive/dev`), in two passes. A conflicting `.liquid` must be gone before its `.json` replacement can upload, and one push can't guarantee that order.

Write each pass's file list to its own file, one path per line:

```bash
python3 -c "import json; p = json.load(open('$S/golive/plan.json'))
open('$S/golive/pass1a.txt','w').write('\n'.join(p['code_changed'] + p['code_new']) + '\n')
open('$S/golive/pass1b.txt','w').write('\n'.join(p['conflict_delete']) + '\n')
open('$S/golive/pass2.txt','w').write('\n'.join(p['content_new'] + [<approved content files>]) + '\n')"
```

Then run each pass with **`eval`** and `--verbose`, and log to a file. The shell is zsh, which doesn't word-split an unquoted `$ONLY`. Without `eval`, every `--only=` flag reaches the CLI as one pattern that matches no file: the push uploads nothing and still reports **success**. That happened on the 2026-10-26 go-live.

```bash
cd "$S/golive/dev"
# Pass 1a: code files, deletions off
ONLY=$(sed 's/^/--only=/' "$S/golive/pass1a.txt" | tr '\n' ' ')
eval "shopify theme push --store=first-cup-coffee-co.myshopify.com --theme=<LIVE_ID> --allow-live --path=. --nodelete $ONLY --verbose" > "$S/golive/pass1a.log" 2>&1
# Pass 1b: the conflicting templates. They're absent from the dev pull, so this scoped push deletes them on live. Abort if any exists locally.
ONLY=$(sed 's/^/--only=/' "$S/golive/pass1b.txt" | tr '\n' ' ')
eval "shopify theme push --store=first-cup-coffee-co.myshopify.com --theme=<LIVE_ID> --allow-live --path=. $ONLY --verbose" > "$S/golive/pass1b.log" 2>&1
# Pass 2: new templates, plus any content file the user approved by name
ONLY=$(sed 's/^/--only=/' "$S/golive/pass2.txt" | tr '\n' ' ')
eval "shopify theme push --store=first-cup-coffee-co.myshopify.com --theme=<LIVE_ID> --allow-live --path=. --nodelete $ONLY --verbose" > "$S/golive/pass2.log" 2>&1
```

**Check every log; don't trust the success box.**
- The `Files to be uploaded:` list (and `Files to be deleted:` in pass 1b) must name exactly the files in that pass's list.
- `grep -c 'via --only' <log>` must equal the number of files in the dev pull minus the pass's file count.
- If a list is empty or a count is off, stop: nothing was pushed for that pass. If the output says "pushed with errors", re-push just the files that failed.

Do pass 2 straight after pass 1b: between them, pages using a deleted template fall back to the default template.

### 8. Verify

Pull live fresh into `$S/golive/after`. Every pushed file must hash identical to `$S/golive/dev`. Every held-back or live-only file must be unchanged from `$S/golive/live`. Every `conflict_delete` file must be gone.

### 9. Re-test production

Run the regression scripts against the new live, using the rollback theme as the baseline (it's the old live):

```bash
cd qa/scripts
node regress.mjs <LIVE_ID> live "$S/golive/reg-live.json"
node regress.mjs <ROLLBACK_ID> rollback "$S/golive/reg-rollback.json"
node interact.mjs <LIVE_ID> live
node compare.mjs "$S/golive/reg-live.json" "$S/golive/reg-rollback.json"
```

Spot-check the real domain too, without a preview param, e.g. `curl -s https://firstcup.com/<changed page> | grep <distinctive string>`.

If anything is broken that wasn't before, **tell the user immediately** and offer the rollback. Don't roll back without their go-ahead unless the storefront is down:

```bash
shopify theme publish --store=first-cup-coffee-co.myshopify.com --theme=<ROLLBACK_ID> --force
```

### 10. Record it

- Pull live into `theme-live/` with `shopify theme pull … --theme=<LIVE_ID> --path=theme-live` so the repo snapshot matches production. Commit it as "Snapshot the live theme after the <date> go-live", ending with the attribution line from the system reminder.
- Add a "Go-live record" section to the latest `qa/*-dev-theme-regression.md`: rollback theme name and ID, files pushed / deleted / held back, verification result, production re-run result. Model it on the 2026-10-26 report.
- Update the theme IDs in memory (`reference-shopify-cli-and-gcp-targets.md`) if anything changed, and add the new rollback theme.
- Report back with: what went live, the rollback ID and the one-line rollback command, anything held back and why, and the production re-test verdict.
