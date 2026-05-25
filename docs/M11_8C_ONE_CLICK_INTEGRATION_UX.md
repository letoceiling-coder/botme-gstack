# M11.8C — One-click Integration UX

## Changes

- **Auto-provision**: opening Connection Center auto-creates encrypted default runtime token
- **Zero placeholders**: all embed codes contain real workspace ID + `ort_live_…` token
- **One-click UX**: prominent copy buttons, 3-step quick setup, live validation polling
- **Token management**: masked prefix in UI, exchange count, last used, regenerate/revoke disconnects WS
- **Self-host ZIP**: `GET /api/widgets/:id/operator-self-host.zip` with ready `.env`, README, install.sh
- **Security**: encrypted token at rest, rate-limited session exchange (30/min), revoke kills sockets

## API

| Endpoint | Description |
|----------|-------------|
| `GET /widgets/:id/connection-center` | Auto-provisions token, returns ready embed codes |
| `POST /widgets/:id/operator-connection/provision` | Regenerate connection + refresh codes |
| `GET /widgets/:id/operator-embed/validation` | Live status (connected/partial/offline) |
| `GET /widgets/:id/operator-self-host.zip` | Download self-host archive |

## Migration

`20260525150000_m11_8c_operator_token_encrypted`

## Readiness: 97%

Pending: manual copy/paste test on external domain.
