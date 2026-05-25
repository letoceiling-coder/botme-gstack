#!/usr/bin/env bash
# Sync coturn config + nginx ACME vhost + certbot renewal hook to production.
# Idempotent — run after editing infra/production/coturn/*.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new"

echo "==> Push turnserver.conf"
rsync -avz -e "$SSH" \
  "$ROOT/infra/production/coturn/turnserver.conf" \
  "$SERVER:/etc/turnserver.conf"

echo "==> Push nginx ACME vhost for turn.neeklo.ru"
rsync -avz -e "$SSH" \
  "$ROOT/infra/production/nginx/turn.neeklo.ru.conf" \
  "$SERVER:/etc/nginx/sites-available/turn.neeklo.ru.conf"

echo "==> Push certbot deploy hook"
rsync -avz -e "$SSH" \
  "$ROOT/infra/production/coturn/certbot-deploy-hook.sh" \
  "$SERVER:/etc/letsencrypt/renewal-hooks/deploy/coturn-turn-neeklo.sh"

echo "==> Apply on server"
$SSH "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
ln -sfn /etc/nginx/sites-available/turn.neeklo.ru.conf /etc/nginx/sites-enabled/turn.neeklo.ru.conf
mkdir -p /var/www/letsencrypt/.well-known/acme-challenge /var/log/turnserver
chown -R www-data:www-data /var/www/letsencrypt
chown turnserver:turnserver /var/log/turnserver 2>/dev/null || true
chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn-turn-neeklo.sh
nginx -t && systemctl reload nginx
# Ensure cert exists; if not, issue it via webroot
if [[ ! -f /etc/letsencrypt/live/turn.neeklo.ru/fullchain.pem ]]; then
  certbot certonly --webroot -w /var/www/letsencrypt -d turn.neeklo.ru \
    --non-interactive --agree-tos -m admin@neeklo.ru --no-eff-email
fi
chgrp -R turnserver /etc/letsencrypt/live/turn.neeklo.ru /etc/letsencrypt/archive/turn.neeklo.ru 2>/dev/null || true
chmod g+rx /etc/letsencrypt/live /etc/letsencrypt/archive
chmod g+rx /etc/letsencrypt/live/turn.neeklo.ru /etc/letsencrypt/archive/turn.neeklo.ru || true
chmod g+r  /etc/letsencrypt/live/turn.neeklo.ru/*.pem /etc/letsencrypt/archive/turn.neeklo.ru/*.pem || true
systemctl restart coturn
sleep 1
ss -tulnp | grep -E ":3478|:5349" | head -10
echo "coturn sync done"
REMOTE

echo "==> Smoke test from this host"
timeout 5 bash -c '</dev/tcp/turn.neeklo.ru/3478' && echo "tcp3478 OPEN"
timeout 5 bash -c '</dev/tcp/turn.neeklo.ru/5349' && echo "tcp5349 OPEN"
echo "Done."
