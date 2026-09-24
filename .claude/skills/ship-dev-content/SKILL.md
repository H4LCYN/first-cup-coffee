---
name: ship-dev-content
description: Push homepage and template content files (templates/*.json, config/settings_data.json) to the First Cup dev theme, reconciling against the theme editor first. Use only when a structural change needs to reach the theme — a section added, removed or reordered — or when the user explicitly says to push settings, index.json, or theme content.
---

# Ship content to dev theme

For the case `/ship-dev` deliberately refuses: getting `templates/*.json` or
`config/settings_data.json` onto the dev theme.

**Default to `/ship-dev` instead.** Only use this one when a structural change
genuinely has to reach the theme — a section added, removed or reordered — or
when the user explicitly asks to push settings/content.

## Why this is separate

These files hold merchant content: which sections exist, their order, and the
text and images inside them. The **theme editor is the source of truth**; the
repo copy is a snapshot from whenever it was last pulled. Pushing a stale copy
silently discards everything edited in admin since — it has wiped the user's
homepage settings more than once.

So the rule here is never "push local over remote". It is **pull first, reapply
the structural change on top of the server's copy, push immediately**.

## Hard rules

- Everything in `/ship-dev`'s hard rules still applies: dev theme only, never
  `--allow-live`, always scoped `--only`, resolve the theme ID with
  `shopify theme list`.
- **Never push a content file you have not just pulled and diffed.** No
  exceptions — this is the whole point of the skill.
- **Push immediately after reconciling.** Every minute between pull and push is
  a window where the user edits in admin and loses it.
- If the user is currently in the theme editor, ask them to finish and save
  before you start.

## Steps

### 1. Pull the server's copy

```bash
rm -rf /tmp/content-sync && mkdir -p /tmp/content-sync
cd theme-dev && shopify theme pull --theme=<DEV_ID> \
  --only=templates/index.json --only=config/settings_data.json \
  --path=/tmp/content-sync
```

Add any other `templates/*.json` in play (`collection.json`, etc).

### 2. Diff server against local, and read it

```bash
diff /tmp/content-sync/templates/index.json theme-dev/templates/index.json
```

Classify every difference before going further:

- **Remote-only** — settings the user made in the theme editor. These must
  survive. If any exist, the local copy is stale.
- **Local-only** — the structural change being shipped (a new section, new
  blocks). These are what you are here to add.

For a structured comparison rather than a line diff:

```bash
python3 -c "
import json, re
def load(p):
    t = open(p, encoding='utf-8').read()
    return json.loads(re.sub(r'^/\*.*?\*/\s*', '', t, flags=re.S))
r = load('/tmp/content-sync/templates/index.json')
l = load('theme-dev/templates/index.json')
print('remote sections:', list(r['sections']))
print('local  sections:', list(l['sections']))
print('remote order:', r['order'])
print('local  order:', l['order'])
for sid in set(r['sections']) & set(l['sections']):
    rs, ls = r['sections'][sid].get('settings', {}), l['sections'][sid].get('settings', {})
    for k in set(rs) | set(ls):
        if rs.get(k) != ls.get(k):
            print(f'  {sid}.{k}: remote={rs.get(k)!r} local={ls.get(k)!r}')
"
```

### 3. Reconcile onto the server's copy

If there are **no remote-only changes**, the local copy is current — go to 4.

Otherwise do not push local as-is. Take the pulled file as the base, apply only
the structural change on top, and write that result to `theme-dev/`. Editing the
server's copy is always correct; editing the local copy is only correct when
nothing has changed in admin since.

When it is not obvious which side should win a given field, stop and ask. Losing
merchant content is worse than a slow ship.

### 4. Validate

```bash
cd theme-dev && python3 -c "
import json, re, glob
for p in glob.glob('templates/*.json') + ['config/settings_data.json']:
    t = open(p, encoding='utf-8').read()
    json.loads(re.sub(r'^/\*.*?\*/\s*', '', t, flags=re.S))
    print(p, 'OK')
"
```

Also confirm every section type referenced still has a file, or the template
fails to load:

```bash
cd theme-dev && python3 -c "
import json, re, os
t = open('templates/index.json', encoding='utf-8').read()
d = json.loads(re.sub(r'^/\*.*?\*/\s*', '', t, flags=re.S))
for sid, s in d['sections'].items():
    p = f\"sections/{s['type']}.liquid\"
    print(('OK  ' if os.path.exists(p) else 'MISSING '), sid, '->', p)
"
```

### 5. Commit and push, scoped to the content files only

Commit with a message naming the structural change and what was reconciled.
Then push just these paths — do not fold in code files, so that if something is
wrong the blast radius is one file:

```bash
cd theme-dev && shopify theme push --theme=<DEV_ID> --only=templates/index.json
```

### 6. Verify, then tell the user to reload the editor

Pull back and confirm both the structural change and the preserved settings are
present:

```bash
rm -rf /tmp/content-verify && mkdir -p /tmp/content-verify
cd theme-dev && shopify theme pull --theme=<DEV_ID> --only=templates/index.json --path=/tmp/content-verify
diff /tmp/content-verify/templates/index.json templates/index.json && echo "identical"
```

Tell the user to reload any open theme editor tab. A stale tab still holds the
pre-push state, and saving from it will overwrite what was just shipped.
