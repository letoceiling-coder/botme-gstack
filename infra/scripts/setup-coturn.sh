#!/usr/bin/env bash
# Install coturn on turn.neeklo.ru — feature-flagged, not exposed until FEATURE_RTC_CALLS=true
set -euo pipefail

TURN_HOST="${TURN_HOST:-turn.neeklo.ru}"
TURN_SECRET="${TURN_AUTH_SECRET:-}"

if [[ -z "$TURN_SECRET" ]]; then
  echo "Set TURN_AUTH_SECRET before running"
  exit 1
fi

apt-get update
apt-get install -y coturn certbot

if [[ ! -f "/etc/letsencrypt/live/${TURN_HOST}/fullchain.pem" ]]; then
  certbot certonly --standalone -d "$TURN_HOST" --non-interactive --agree-tos -m admin@neeklo.ru || true
fi

PUBLIC_IP=$(curl -sf ifconfig.me || hostname -I | awk '{print $1}')

cat > /etc/turnserver.conf <<EOF
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=${PUBLIC_IP}
external-ip=${PUBLIC_IP}
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=${TURN_SECRET}
stale-nonce
no-loopback-peers
no-multicast-peers
no-cli
min-port=49152
max-port=65535
max-bps=3000000
cert=/etc/letsencrypt/live/${TURN_HOST}/fullchain.pem
pkey=/etc/letsencrypt/live/${TURN_HOST}/privkey.pem
EOF

systemctl enable coturn
systemctl restart coturn
echo "coturn configured for ${TURN_HOST} (RTC disabled until FEATURE_RTC_CALLS=true)"
