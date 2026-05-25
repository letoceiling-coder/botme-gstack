#!/usr/bin/env bash
# Export self-host operator runtime package (M11.8).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="$ROOT/apps/operator-panel/dist"
OUT="$ROOT/operator-runtime"

cd "$ROOT"

echo "==> Build operator panel"
pnpm --filter @botme/operator-panel build

echo "==> Sync runtime assets"
mkdir -p "$OUT/assets"
rsync -a --delete "$DIST/assets/" "$OUT/assets/"
cp "$DIST/index.html" "$OUT/operator-runtime-index.html"
cp "$DIST/operator.js" "$OUT/operator.js" 2>/dev/null || true

# Generate standalone operator.html with current hashed embed bundle
EMBED_JS=$(ls "$DIST/assets"/embed-*.js 2>/dev/null | head -1)
EMBED_CSS=$(ls "$DIST/assets"/embed-*.css 2>/dev/null | head -1 || true)
if [[ -n "$EMBED_JS" ]]; then
  JS_NAME=$(basename "$EMBED_JS")
  CSS_BLOCK=""
  if [[ -n "$EMBED_CSS" ]]; then
    CSS_NAME=$(basename "$EMBED_CSS")
    CSS_BLOCK="  <link rel=\"stylesheet\" crossorigin href=\"./assets/${CSS_NAME}\">"
  fi
  cat > "$OUT/operator.html" <<EOF
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Botme Operator Runtime</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0f1419; }
    #root { height: 100dvh; width: 100%; }
  </style>
${CSS_BLOCK}
  <script type="module" crossorigin src="./assets/${JS_NAME}"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>
EOF
fi

echo "==> Operator runtime package ready at operator-runtime/"
ls -la "$OUT"
