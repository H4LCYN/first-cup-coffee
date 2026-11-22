#!/bin/bash
# Push the 14 merged code files from theme-dev/ to the dev or live theme. Run from the repo root:
#   bash qa/golive-2026-11-22/push-code.sh dev    # first-cup-coffee-benny-dev
#   bash qa/golive-2026-11-22/push-code.sh live   # first-cup-live-11-22-2026 (the published theme)
# Backup of live from before today's sync: rollback-live-2026-11-22-pre-repo-sync (ID 160769769694).
# Content files (index.json, settings_data.json, product.*.json templates) are NOT pushed.
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
STORE=first-cup-coffee-co.myshopify.com
case "${1:-}" in
  dev)  THEME_ID=159869010142; LIVE_FLAG="" ;;
  live) THEME_ID=160769573086; LIVE_FLAG="--allow-live" ;;
  *) echo "usage: $0 dev|live"; exit 1 ;;
esac
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
FILES="assets/box-builder.css assets/box-builder.js assets/cart-2026.css assets/feature-buy-box.js
config/settings_schema.json layout/theme.liquid sections/main-product-feature.liquid sections/navbar.liquid
sections/prayer-wall.liquid sections/section-collection-products.liquid snippets/feature-box-lead.liquid
templates/cart.liquid templates/page.prayer-wall.liquid templates/product.liquid"
STAGE="$(mktemp -d)"
for f in $FILES; do mkdir -p "$STAGE/$(dirname "$f")"; cp "$REPO/theme-dev/$f" "$STAGE/$f"; done
cd "$STAGE"
ONLY=""; for f in $FILES; do ONLY="$ONLY --only=$f"; done
echo "Pushing $(echo $FILES | wc -w | tr -d ' ') files to $1 theme $THEME_ID"
eval "shopify theme push --store=$STORE --theme=$THEME_ID $LIVE_FLAG --path=. --nodelete $ONLY --verbose" 2>&1 | tee "$REPO/qa/golive-2026-11-22/push-$1.log"
