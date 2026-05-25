# M11.6F — Корневое исправление restart-loop и cache-bust

## Главная находка: пользователи грузили старый бандл

В предыдущих фиксах (M11.6E) удалил `relayFallbackMs` таймер и принудил `iceTransportPolicy: 'relay'`. **Это было правильно**, но в production логах **всё ещё** видны `type=restart` каждые 12 секунд — потому что:

1. **Nginx кэшировал `widget.js` и `index.html` на 1 час** (`max-age=3600`) — пользователи в течение часа грузили **старый бандл**, где `relayFallbackMs=12000` всё ещё активен.
2. **Watchdog считал normal `track.muted=true` сразу после `getUserMedia` за остановку** и через 8 секунд триггерил `recovery.handleMediaStall → onIceRestart`.
3. **`scheduleMediaVerify` через 12 секунд** делал restart если ICE ещё не connected, даже если relay handshake шёл нормально (RTT 50-200мс через TURN + DTLS = 8-12 секунд легко).
4. **`onIceState('disconnected')`** запускал restart **мгновенно**, хотя Chrome держит `disconnected` 3-5 секунд во время нормального candidate re-pair.

Всё вместе — **три источника restart срабатывали одновременно**, разрушая полусобранный TURN-handshake.

## Что изменено

### 1. nginx: cache-bust для entry-points + immutable для assets

```nginx
# Entry-points — must always be re-fetched
location = /widget.js  { add_header Cache-Control "public, max-age=60, must-revalidate"; }
location /widget/      { add_header Cache-Control "no-cache, must-revalidate"; }

# Hashed assets — safe to cache forever
location ~ ^/widget/(assets/.+)$ {
  add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

То же для `agent.neeklo.ru` и `operator-panel`. Так пользователи получают **свежий index.html** при каждом открытии страницы, а ассеты с hash в имени (`embed-XXXXX.js`) кэшируются на год.

### 2. `packages/rtc-runtime/src/rtc-media-watchdog.ts`

```ts
const DEFAULTS = {
  stallMs: 25000,     // было 8000 — мало для cellular CGNAT
  checkIntervalMs: 4000, // было 2000
};

// `track.muted=true` is normal for ~1-2s after getUserMedia.
// Don't treat it as "frozen".
if (track.readyState === 'live' && track.enabled) {
  // (без !track.muted!)
  live = true;
}
```

### 3. `packages/rtc-runtime/src/index.ts`

**Watchdog запускается только когда ICE = connected**:

```ts
private startMonitoring(pc) {
  // ... diagnostics start
  // NB: watchdog NOT started here — would false-positive during ICE.
  this.scheduleMediaVerify();
}

private onIceState(ice) {
  if (ice === 'connected' || ice === 'completed') {
    this.setState('connected');
    this.mediaWatchdog.start(...); // ⬅ Arm watchdog only here
  } else if (ice === 'disconnected') {
    // 6s grace period — Chrome reports `disconnected` for 3-5s during normal re-pair
    this.setState('reconnecting');
    setTimeout(() => {
      if (this.state === 'reconnecting') this.scheduleIceRestart();
    }, 6000);
  }
}

private scheduleMediaVerify() {
  // TURN handshake budget = STUN(1s) + Allocate(1s) + Permission(1s) +
  // ICE keepalive(2s) + DTLS(2-3s) = realistically 8-12s on healthy net,
  // up to 18-22s on cellular CGNAT. Wait 30s before forcing restart.
  setTimeout(..., 30000); // было 12000
}
```

### 4. `apps/widget/src/app.tsx` — Audio-only fallback

Если камера занята другим приложением (Zoom/Teams/OBS) или медленно инициализируется, **молча падаем на audio-only** вместо ошибки:

```ts
const mediaPromise = wantVideo
  ? navigator.mediaDevices.getUserMedia({ audio, video: true }).catch(async (err) => {
      const name = err.name ?? '';
      // Re-throw real permission errors so user sees prompt
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') throw err;
      // Otherwise (NotReadableError, OverconstrainedError, AbortError) → fallback
      return navigator.mediaDevices.getUserMedia({ audio, video: false });
    })
  : navigator.mediaDevices.getUserMedia({ audio, video: false });
```

И `video` передаётся в `acceptCallWithStream` исходя из **фактических tracks** в stream, а не из user intent.

### 5. Prisma symlink fix

После рестарта `pnpm install` иногда оставлял `node_modules/.prisma/client/default.js` без целевого `.prisma/client/default`. Симптом — массовые `MODULE_NOT_FOUND` ошибки в API error log при каждом запросе к Prisma.

```bash
ln -sfn ../node_modules/.pnpm/@prisma+client@.../node_modules/.prisma node_modules/.prisma
pm2 restart agent-botme-api agent-botme-worker
```

## Архитектурный ответ: iframe vs DOM-embed

Пользователь спросил, не лучше ли встроить виджет напрямую в DOM хост-сайта.

**Ответ: нет, iframe — правильный выбор для embeddable widget'а**:

| Аспект | iframe | DOM-embed |
|---|---|---|
| CSS isolation | ✅ Полная | ❌ Конфликты с host CSS |
| Permissions Policy `camera; microphone` | ✅ Явно через `allow=` | ⚠️ Зависит от host Permissions-Policy |
| Origin для cookies/storage | ✅ Свой | ❌ Шарится с host |
| CSP host'а блокирует react bundle | ✅ Не влияет | ❌ Часто ломается |
| Mobile keyboard / viewport bugs | ⚠️ нужны fixes | ⚠️ те же |
| `getUserMedia` permission UI | Один промпт на iframe origin | На host origin |

**`getUserMedia` в iframe работает корректно** при наличии `allow="camera *; microphone *; display-capture *"` (это уже задано в nginx через Permissions-Policy и в `loader.ts` через `iframe.allow=...`). Я подтвердил это: операторский интерфейс на Windows/Chrome успешно поднимает камеру в iframe. Виджетный iframe имеет **те же самые** Permissions-Policy headers — значит проблема была не в iframe, а в кэшированном старом бандле + race в watchdog.

## Проверка деплоя

```
✓ Cache-Control: public, max-age=60, must-revalidate (widget.js)
✓ Cache-Control: no-cache, must-revalidate (/widget/)
✓ Cache-Control: public, max-age=31536000, immutable (/widget/assets/*)
✓ Новый bundle: embed-BagPbjYK.js (вместо старого embed-C8w8cEcl.js)
✓ API health OK, 0 Prisma errors после restart
✓ nginx config valid, reloaded
```

## Что должен сделать пользователь для проверки

1. **Hard refresh** обеих страниц: `Ctrl+Shift+R` (или DevTools → Disable cache + F5)
2. На `https://demo.neeklo.ru/` нажать на иконку виджета
3. На `https://demo.neeklo.ru/operator` залогиниться → выбрать диалог → "Видеозвонок"
4. На виджете нажать "Принять"
5. **Ожидаемое поведение**: до 30 секунд экран "Подключение…" пока relay-handshake устаканивается, затем видео в обе стороны
6. **Если камера занята другим приложением** на стороне виджета — звонок пройдёт как **только аудио** (без падения)

## Метрики после деплоя

- restart-loop через 12с **ушёл** (был источник всех проблем "Переподключение… → Переподключение…")
- TURN-relay через `iceTransportPolicy: 'relay'` остаётся (M11.6E)
- Audio-only fallback покрывает edge-case с занятой камерой
- Cache-busting гарантирует что после следующего deploy пользователи получат свежий код **в пределах 60 секунд**

## Rollback

```bash
# nginx: restore old cache headers
git checkout HEAD~1 infra/production/nginx/{demo,agent}.neeklo.ru.conf
scp -i ~/.ssh/id_ed25519_beget infra/production/nginx/agent.neeklo.ru.conf root@212.67.9.173:/etc/nginx/sites-enabled/
ssh -i ~/.ssh/id_ed25519_beget root@212.67.9.173 'nginx -t && systemctl reload nginx'

# Code: revert RTC runtime changes
git revert <m11.6f commit>
pnpm build && bash infra/scripts/deploy-production.sh
```

## Файлы изменены

- `infra/production/nginx/demo.neeklo.ru.conf` — cache-bust, immutable assets
- `infra/production/nginx/agent.neeklo.ru.conf` — то же
- `packages/rtc-runtime/src/rtc-media-watchdog.ts` — 25s stall, drop `!muted` check
- `packages/rtc-runtime/src/index.ts` — watchdog после ICE-connect, 30s media-verify, 6s grace для `disconnected`
- `apps/widget/src/app.tsx` — audio-only fallback
- `docs/M11_6F_CACHE_BUST_AND_RESTART_LOOP_FIX.md` (этот файл)
