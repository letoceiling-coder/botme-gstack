#!/usr/bin/env bash
# Issue SSL + enable nginx for demo.neeklo.ru (does NOT touch agent.neeklo.ru certbot configs)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="${DEPLOY_SERVER:-root@212.67.9.173}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_beget}"
DOMAIN="demo.neeklo.ru"
WEBROOT="/var/www/demo.neeklo.ru/dist"

echo "==> Prepare webroot on server"
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p ${WEBROOT} ${WEBROOT}/.well-known/acme-challenge"

echo "==> Upload temporary HTTP-only nginx (for certbot webroot)"
ssh -i "$SSH_KEY" "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
cat > /etc/nginx/sites-available/demo.neeklo.ru.conf <<'NGINX'
server {
    listen 80;
    server_name demo.neeklo.ru;
    root /var/www/demo.neeklo.ru/dist;
    location /.well-known/acme-challenge/ { allow all; }
    location / { return 200 'demo setup\n'; add_header Content-Type text/plain; }
}
NGINX
ln -sf /etc/nginx/sites-available/demo.neeklo.ru.conf /etc/nginx/sites-enabled/demo.neeklo.ru.conf
nginx -t
systemctl reload nginx
REMOTE

echo "==> Issue Let's Encrypt certificate (demo.neeklo.ru only)"
ssh -i "$SSH_KEY" "$SERVER" \
  "certbot certonly --webroot -w ${WEBROOT} -d ${DOMAIN} --non-interactive --agree-tos -m admin@neeklo.ru --cert-name ${DOMAIN} || certbot certonly --webroot -w ${WEBROOT} -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --cert-name ${DOMAIN}"

echo "==> Install production demo nginx config"
rsync -avz -e "ssh -i ${SSH_KEY}" \
  "${ROOT}/infra/production/nginx/demo.neeklo.ru.conf" \
  "${SERVER}:/etc/nginx/sites-available/demo.neeklo.ru.conf"

ssh -i "$SSH_KEY" "$SERVER" bash -s <<'REMOTE'
ln -sf /etc/nginx/sites-available/demo.neeklo.ru.conf /etc/nginx/sites-enabled/demo.neeklo.ru.conf
nginx -t
systemctl reload nginx
echo "==> SSL certificates:"
certbot certificates 2>/dev/null | grep -A3 'demo.neeklo.ru' || certbot certificates
REMOTE

echo "==> Verify HTTPS"
curl -sfI "https://${DOMAIN}/" | head -n 5 || echo "DNS/HTTPS may need propagation"
echo "Setup complete for ${DOMAIN}"
