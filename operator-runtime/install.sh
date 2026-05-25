#!/usr/bin/env bash
# Botme operator runtime — quick install on your server
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found. Copy env.example to .env and fill values."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

WEB_ROOT="${WEB_ROOT:-/var/www/operator-runtime}"
DOMAIN="${DOMAIN:-operators.example.com}"

echo "==> Installing operator runtime to ${WEB_ROOT}"
sudo mkdir -p "$WEB_ROOT"
sudo cp -a "${ROOT}/." "$WEB_ROOT/"
sudo cp "${ROOT}/nginx.conf.example" "/etc/nginx/sites-available/${DOMAIN}.conf"

echo "==> Enable site (edit SSL paths in nginx config first)"
echo "    sudo ln -sf /etc/nginx/sites-available/${DOMAIN}.conf /etc/nginx/sites-enabled/"
echo "    sudo certbot --nginx -d ${DOMAIN}"
echo "    sudo nginx -t && sudo systemctl reload nginx"

echo "==> Done. Open https://${DOMAIN}/operator.html?token=${BOTME_OPERATOR_TOKEN}"
