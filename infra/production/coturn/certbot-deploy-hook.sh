#!/usr/bin/env bash
# Certbot post-renewal hook: reload coturn after turn.neeklo.ru cert renews.
# Install:
#   ln -sfn $REMOTE/infra/production/coturn/certbot-deploy-hook.sh \
#     /etc/letsencrypt/renewal-hooks/deploy/coturn-turn-neeklo.sh
set -euo pipefail

# RENEWED_DOMAINS is provided by certbot to deploy hooks.
case "${RENEWED_DOMAINS:-}" in
  *turn.neeklo.ru*)
    # Re-apply group permissions so the turnserver user can read the new key.
    chgrp -R turnserver /etc/letsencrypt/live/turn.neeklo.ru /etc/letsencrypt/archive/turn.neeklo.ru 2>/dev/null || true
    chmod g+rx /etc/letsencrypt/live /etc/letsencrypt/archive
    chmod g+rx /etc/letsencrypt/live/turn.neeklo.ru /etc/letsencrypt/archive/turn.neeklo.ru || true
    chmod g+r  /etc/letsencrypt/live/turn.neeklo.ru/*.pem /etc/letsencrypt/archive/turn.neeklo.ru/*.pem || true
    systemctl restart coturn
    ;;
esac
