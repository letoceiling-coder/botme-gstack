# M11 — TURN/STUN Infrastructure Plan

**Domain:** turn.neeklo.ru  
**Server:** root@212.67.9.173 (same as agent.neeklo.ru)  
**Status:** Planned — not yet deployed

---

## 1. Topology

```
Browser A (visitor)                    Browser B (operator)
      │                                        │
      ├──── STUN turn.neeklo.ru:3478 ──────────┤
      ├──── TURN TLS turn.neeklo.ru:5349 ──────┤
      │         (coturn relay)                 │
      └──── Signaling via agent.neeklo.ru WS ──┘
```

---

## 2. coturn Configuration (draft)

```ini
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=<SERVER_PUBLIC_IP>
external-ip=<SERVER_PUBLIC_IP>

fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=<ROTATED_SECRET>
stale-nonce
no-loopback-peers
no-multicast-peers
no-cli

cert=/etc/letsencrypt/live/turn.neeklo.ru/fullchain.pem
pkey=/etc/letsencrypt/live/turn.neeklo.ru/privkey.pem

min-port=49152
max-port=65535
max-bps=3000000
```

---

## 3. Ephemeral Credentials (API)

```typescript
// HMAC(username:timestamp, TURN_SECRET) → password
const username = `${Date.now() + 86400}`; // 24h TTL
const credential = crypto.createHmac('sha1', TURN_SECRET)
  .update(username).digest('base64');
```

Issued by `WebRTCSignalGateway` on call start only.

---

## 4. Firewall

```bash
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 5349/tcp
ufw allow 49152:65535/udp  # relay range
```

---

## 5. DNS

```
turn.neeklo.ru  A  212.67.9.173
```

Let's Encrypt: `certbot certonly --nginx -d turn.neeklo.ru`

---

## 6. ICE Strategy

1. Host candidates (LAN)
2. STUN srflx
3. TURN relay (TLS preferred, TCP fallback)
4. ICE restart on network change / reconnect

---

## 7. Codec Policy

| Media | Primary | Fallback |
|-------|---------|----------|
| Video | VP8 | H264 |
| Audio | Opus | — |

Constraints: echo cancellation, noise suppression, auto gain.

---

## 8. Network Degradation

| Condition | Action |
|-----------|--------|
| packetLoss > 5% | Reduce resolution |
| RTT > 400ms | Lower bitrate cap |
| video unstable 30s | Offer audio-only fallback |
| ICE failed | TURN-only retry |

---

## 9. Validation Checklist

```bash
systemctl status coturn
nginx -t
turnutils_uclient -T -u <user> -w <pass> turn.neeklo.ru
# Browser: chrome://webrtc-internals
```

Cross-test: Windows, macOS, Android Chrome, iOS Safari, corporate WiFi, CGNAT.

---

## 10. Browser / OS Matrix (target)

| Platform | Voice | Video | Fullscreen | PiP |
|----------|-------|-------|------------|-----|
| Chrome desktop | ✅ | ✅ | ✅ | ✅ |
| Firefox desktop | ✅ | ✅ | ✅ | ✅ |
| Safari macOS | ✅ | ✅ | ✅ | ⚠️ |
| Safari iOS | ✅ | ✅ | ⚠️ fallback | ❌ |
| Android Chrome | ✅ | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ | ✅ |

---

## 11. Rollback

```bash
systemctl stop coturn
systemctl disable coturn
# Calls fall back to signaling-only / chat
```

---

## 12. Readiness: 0%

Pending: DNS, cert, coturn install, API credential endpoint, browser E2E.

Reference: Messager on neekloai.ru (89.169.39.244) — requires SSH key access.
