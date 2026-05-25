# M11.6C — TURN / coturn Production Fix (`turn.neeklo.ru`)

Production calls were stuck in `RECONNECTING` with no media flow on both visitor and operator. Signaling was healthy (offers/answers/ICE all relayed by API), but ICE never reached `connected` and the call kept looping through `restart`. Root cause: TURN allocations were rejected — clients fell back to host/srflx candidates only, which is unreliable across NAT/cellular networks.

## Root Cause

`coturn` on `turn.neeklo.ru` (`212.67.9.173`) had two problems that together broke every relayed call:

1. **Missing `realm`** — `/etc/turnserver.conf` enabled `use-auth-secret` (REST-style ephemeral credentials) but omitted the `realm=` directive. Without a realm coturn rejected every allocation with **HTTP 401 Unauthorized**, even though the HMAC was correctly computed by `WebRtcSignalService.issueTurnCredentials`.

   Reproduction (before fix):

   ```
   USER=1779474653 PASS=g4qRviai8FUeTMRX2J7a2Uspy8g=
   $ turnutils_uclient -u $USER -w $PASS -v -t 127.0.0.1
   0: : allocate response received:
   0: : error 401 (Unauthorized)
   ```

2. **No TLS cert for `turn.neeklo.ru`** — `/etc/letsencrypt/live/turn.neeklo.ru/` did not exist. coturn silently failed to bind `tls-listening-port=5349`, so the `turns:turn.neeklo.ru:5349?transport=tcp` URL advertised in `issueTurnCredentials` was a dead address. iOS Safari + corporate/cellular firewalls that block UDP had **no TLS fallback** — calls there were impossible.

Combined effect: ICE candidate pairs could never be relayed, the candidate pair check timed out, `RtcRecoveryEngine` triggered an ICE restart, which produced the next "restart" log line and started the loop again.

## Fix

### Server config (`/etc/turnserver.conf`)

Mirrored into the repo at `infra/production/coturn/turnserver.conf`. Key additions:

```
realm=neeklo.ru
server-name=turn.neeklo.ru
stale-nonce=600
no-tlsv1
no-tlsv1_1
total-quota=200
user-quota=10
log-file=/var/log/turnserver/turnserver.log
verbose
simple-log
no-stdout-log
```

### TLS certificate

Issued a Let's Encrypt cert for `turn.neeklo.ru` via webroot. A minimal HTTP-only nginx vhost (`infra/production/nginx/turn.neeklo.ru.conf`) serves `/.well-known/acme-challenge/` and 301-redirects everything else to `agent.neeklo.ru`. The webroot is `/var/www/letsencrypt`.

### Certbot renewal hook

`infra/production/coturn/certbot-deploy-hook.sh` is installed to `/etc/letsencrypt/renewal-hooks/deploy/coturn-turn-neeklo.sh`. On every successful renewal it:

- re-applies `turnserver` group permissions on the LE archive + live directories,
- restarts coturn so the new key is picked up.

### Idempotent sync script

`infra/scripts/sync-turnserver.sh` pushes the three files above, ensures the cert exists, fixes permissions, reloads nginx, restarts coturn, and runs an external smoke test.

## Verification (post-fix)

```
=== ports ===
udp 0.0.0.0:3478   turnserver
udp 0.0.0.0:5349   turnserver   (DTLS)
tcp 0.0.0.0:3478   turnserver
tcp 0.0.0.0:5349   turnserver   (TLS)

=== TURN allocation (3478) ===
tot_send_msgs=20, tot_recv_msgs=20
Total lost packets 0 (0.000000%)
Average round trip delay 3.9 ms

=== TURN allocation (5349 TLS) ===
tot_send_msgs=20, tot_recv_msgs=20
Total lost packets 0 (0.000000%)

=== External TCP reachability ===
tcp 3478 OPEN
tcp 5349 OPEN
TLS handshake: subject=CN=turn.neeklo.ru, Verify return code: 0 (ok)

=== coturn live session log ===
session ...: realm <neeklo.ru>, ...     # realm now populated, no more 401s
```

## API side

`WebRtcSignalService.issueTurnCredentials` was already correct — it generates `username=<ttl-expiry>` + `credential=base64(hmac-sha1(secret, username))` and returns `stun:`, `turn:udp`, `turn:tcp`, `turns:tcp` URLs. **No API change or restart was needed** — only coturn-side was misconfigured.

## Rollback

```bash
ssh root@212.67.9.173 cp /etc/turnserver.conf.bak.<ts> /etc/turnserver.conf
ssh root@212.67.9.173 systemctl restart coturn
```

The pre-fix backup is stored on the server as `/etc/turnserver.conf.bak.<unix-ts>`.

## Follow-ups

- Migrate the `static-auth-secret` out of `/etc/turnserver.conf` and `apps/api/.env` into a single managed secret (vault/SOPS) so the two values cannot drift.
- Consider also advertising `turns:5349?transport=udp` (DTLS) — currently we advertise only the TCP variant.
- coturn now logs to `/var/log/turnserver/turnserver.log` (with `verbose`) — wire to log rotation if not already covered by the default `coturn` package logrotate.
