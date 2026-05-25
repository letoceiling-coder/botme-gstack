# M11.8 — Operator Embed SDK + Self-Host Runtime

Production guide for embedding the operator panel on external sites and self-hosting the operator runtime.

## Overview

| Asset | URL |
|-------|-----|
| Operator embed SDK | `https://agent.neeklo.ru/operator.js` |
| Operator runtime (iframe) | `https://agent.neeklo.ru/operator-runtime/?token=…` |
| Legacy loader | `https://agent.neeklo.ru/operator-panel.js` |
| Session exchange API | `POST /api/public/operator-runtime/session` |

Connection Center (`/admin/widgets` → tab **Кабинет оператора**) provides:

- Standalone URL
- Script / iframe embed codes
- React, Vue, Nuxt, Next examples
- Runtime token generation
- Allowed domains
- Live preview

---

## 1. Generate runtime token

1. Open **Connection Center** → select widget → **Кабинет оператора**.
2. Click **Сгенерировать token**.
3. Copy the token immediately (shown once).
4. Set allowed domains on the token (defaults to widget domains).

Tokens are:

- Scoped to workspace (+ widget)
- Revocable
- Optional expiration
- Bound to WebSocket/RTC auth via JWT exchange

---

## 2. HTML — script embed

```html
<script
  src="https://agent.neeklo.ru/operator.js"
  data-workspace="YOUR_WORKSPACE_ID"
  data-operator-token="ort_…"
  data-theme="dark"
  data-position="fullscreen"
></script>
```

Attributes:

| Attribute | Description |
|-----------|-------------|
| `data-workspace` | Workspace ID |
| `data-operator-token` | Runtime token (`ort_…`) |
| `data-theme` | `dark` or `light` |
| `data-position` | `fullscreen` or inline |
| `data-api-origin` | API origin override (self-host) |
| `data-panel-origin` | Runtime iframe origin override |

---

## 3. HTML — iframe embed

```html
<iframe
  src="https://agent.neeklo.ru/operator-runtime/?token=ort_…&workspace=WORKSPACE_ID&theme=dark"
  allow="camera; microphone; fullscreen; autoplay; display-capture"
  style="width:100%;height:100dvh;border:none;background:#0f1419"
  title="Operator panel"
></iframe>
```

---

## 4. React integration

```tsx
import { useEffect } from 'react';

export function OperatorEmbed() {
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://agent.neeklo.ru/operator.js';
    s.dataset.workspace = 'YOUR_WORKSPACE_ID';
    s.dataset.operatorToken = 'ort_…';
    s.dataset.theme = 'dark';
    s.dataset.position = 'fullscreen';
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []);
  return null;
}
```

---

## 5. Vue 3 integration

```vue
<script setup>
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
  const s = document.createElement('script');
  s.src = 'https://agent.neeklo.ru/operator.js';
  s.dataset.workspace = 'YOUR_WORKSPACE_ID';
  s.dataset.operatorToken = 'ort_…';
  document.body.appendChild(s);
  onUnmounted(() => s.remove());
});
</script>
```

---

## 6. Nuxt 3 integration

```vue
<script setup lang="ts">
useHead({
  script: [{
    src: 'https://agent.neeklo.ru/operator.js',
    'data-workspace': 'YOUR_WORKSPACE_ID',
    'data-operator-token': 'ort_…',
    'data-theme': 'dark',
    'data-position': 'fullscreen',
  }],
});
</script>
```

---

## 7. Next.js integration

```tsx
import Script from 'next/script';

export default function OperatorPage() {
  return (
    <Script
      src="https://agent.neeklo.ru/operator.js"
      data-workspace="YOUR_WORKSPACE_ID"
      data-operator-token="ort_…"
      data-theme="dark"
      data-position="fullscreen"
      strategy="afterInteractive"
    />
  );
}
```

---

## 8. Self-host operator runtime

Export package:

```bash
bash infra/scripts/export-operator-runtime.sh
```

Package contents (`operator-runtime/`):

- `operator.html` — standalone entry
- `assets/` — hashed runtime bundles
- `operator.js` — embed loader copy
- `config.json` — API/WS/TURN defaults
- `env.example`
- `nginx.conf.example`

### Recommended self-host architecture

Proxy `/api/` and `/socket.io/` on your domain to `agent.neeklo.ru` (see `nginx.conf.example`). This avoids cross-origin CORS issues.

### config.json

```json
{
  "apiUrl": "https://agent.neeklo.ru/api",
  "websocketUrl": "wss://agent.neeklo.ru/socket.io",
  "operatorJsUrl": "https://agent.neeklo.ru/operator.js",
  "turnHost": "turn.neeklo.ru"
}
```

---

## 9. nginx (agent.neeklo.ru)

```nginx
location = /operator.js {
  alias /var/www/agent.neeklo.ru/apps/operator-panel/dist/operator.js;
  add_header Access-Control-Allow-Origin *;
}

location /operator-runtime/ {
  alias /var/www/agent.neeklo.ru/apps/operator-panel/dist/;
  add_header Permissions-Policy "camera=*, microphone=*, autoplay=*, fullscreen=*, display-capture=*" always;
}
```

---

## 10. WebSocket / RTC

- Operator namespace: `/operator` on Socket.IO
- Auth: JWT from runtime token exchange via `auth: { token }` or cookie
- RTC signaling: same socket (`webrtc:signal`, `webrtc:call-join`, …)
- TURN: `turn.neeklo.ru:3478` (UDP + TCP)
- ICE restart + recovery tokens handled by `@botme/rtc-runtime`

### Permissions-Policy

```
Permissions-Policy: camera=*, microphone=*, autoplay=*, fullscreen=*, display-capture=*
```

### CSP example

```
script-src 'self' https://agent.neeklo.ru;
connect-src 'self' https://agent.neeklo.ru wss://agent.neeklo.ru;
```

---

## 11. Reconnect flow

Operator runtime includes:

- Socket.IO reconnection (infinite attempts, backoff)
- 25s heartbeat (`ping` / server `pong`)
- RTC ICE restart on network change
- TURN fallback when direct ICE fails
- Degraded connection UI in operator panel

---

## 12. Troubleshooting

| Symptom | Check |
|---------|-------|
| «Не авторизован» on connect | Token revoked/expired; regenerate in Connection Center |
| Black video / no RTC | HTTPS, camera permissions, TURN reachability |
| WebSocket fails on self-host | Proxy `/socket.io/` with Upgrade headers |
| Domain rejected | Add domain to token allowedDomains |
| Stale bundle | Hard refresh; `operator.js` cache max-age 60s |

---

## 13. Production checklist

- [ ] Runtime token generated and stored securely
- [ ] Allowed domains configured
- [ ] `operator.js` returns 200 from production
- [ ] `/operator-runtime/?token=…` loads panel
- [ ] WebSocket connects (operators online counter > 0)
- [ ] Takeover + chat work
- [ ] Video call widget ↔ operator works
- [ ] Reconnect after network toggle
- [ ] nginx Permissions-Policy set
- [ ] Migration `20260522140000_m11_8_operator_runtime_tokens` applied

---

## API reference

### Create token

`POST /api/widgets/:widgetId/operator-tokens` (ADMIN+)

```json
{ "name": "Production", "allowedDomains": ["operators.example.com"], "expiresInDays": 90 }
```

### Exchange session

`POST /api/public/operator-runtime/session`

```json
{ "token": "ort_…", "workspaceId": "…" }
```

Response:

```json
{
  "accessToken": "…",
  "expiresIn": 900,
  "user": { "id": "…", "email": "…", "name": "…" },
  "workspace": { "id": "…", "name": "…", "slug": "…", "role": "OPERATOR" }
}
```

### Revoke token

`DELETE /api/widgets/:widgetId/operator-tokens/:tokenId`
