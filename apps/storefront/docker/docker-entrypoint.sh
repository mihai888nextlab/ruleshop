#!/bin/sh
set -eu

CONFIG=/usr/share/nginx/html/config.js

# Escape for embedding inside a single-quoted JS string.
js_escape() {
  printf '%s' "$1" | sed "s/\\\\/\\\\\\\\/g; s/'/\\\\'/g"
}

API_URL="${RULESHOP_API_URL:-${VITE_RULESHOP_API_URL:-}}"
API_KEY="${RULESHOP_API_KEY:-${VITE_RULESHOP_API_KEY:-}}"

if [ -z "$API_URL" ] || [ -z "$API_KEY" ]; then
  echo "ruleshop-storefront: set RULESHOP_API_URL and RULESHOP_API_KEY" >&2
  exit 1
fi

API_URL=$(printf '%s' "$API_URL" | sed 's:/*$::')

cat > "$CONFIG" <<EOF
window.__RULESHOP_CONFIG__ = {
  apiUrl: '$(js_escape "$API_URL")',
  apiKey: '$(js_escape "$API_KEY")'
};
EOF

exec "$@"
