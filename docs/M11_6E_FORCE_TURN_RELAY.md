# M11.6E — Force TURN Relay From Start (Production Stability)

После M11.6D ситуация частично улучшилась — TURN-сессии начали показывать peer traffic (`rp=282 rb=27072`), но звонки всё равно зависали в `Переподключение…`. Причина: **glare в relay-fallback** + **асимметрия ICE policy между сторонами**.

## Доказательство проблемы

```
=== coturn ===
peer usage rp=282 rb=27072 sp=0 sb=0   ← одна сторона шлёт через relay, вторая не отвечает
peer usage rp=33  rb=3168  sp=0 sb=0   ← то же самое
```

`rp/rb` — peer side получил трафик, `sp/sb` = 0 — peer не **отправляет** через TURN. Только одна сторона активировала relay, вторая пытается ходить напрямую (host/srflx), и эти пары никогда не парятся.

```
=== API webrtc:signal ===
7:18:55 type=offer
7:19:07 type=restart   ← через 12 секунд
7:21:28 type=offer  
7:21:41 type=restart   ← через 13 секунд
```

Это работа моего асимметричного `forceRelayFallback()` из M11.6D: только сторона у которой сработал таймер пересоздавала PC с `iceTransportPolicy: 'relay'`, другая сторона держала свой старый PC. Новый offer прилетал на старый PC → glare → следующий таймер → следующий restart → бесконечно.

## Fix: relay с обеих сторон **с самого начала**

Это стандартное решение для customer-support видеозвонков (whereby, freshcaller, intercom): не пытаемся peer-to-peer, идём через TURN всегда. Лишние 20-50 мс латентности не заметны в разговоре, зато **гарантированная работа** в любой сети.

```ts
// packages/rtc-runtime/src/types.ts
export interface RtcRuntimeConfig {
  /** Force every ICE candidate pair to go through TURN. Defaults to true. */
  forceTurnRelay?: boolean;
  // ... (removed: relayFallbackMs, onRelayFallback)
}

// packages/rtc-runtime/src/index.ts
private createPeerManager(): PeerConnectionManager {
  const forceRelay = this.config.forceTurnRelay !== false;
  return new PeerConnectionManager({
    iceServers: this.config.iceServers,
    iceTransportPolicy: forceRelay ? 'relay' : undefined,   // ← all-or-nothing
    // ...
  });
}
```

Полностью убран глитчевый `armRelayFallback()` / `forceRelayFallback()` — никаких пересозданий PC, никаких glare, никаких неожиданных new-offer'ов на середине звонка.

Обе стороны (widget + operator-panel) включают:

```ts
new RtcRuntime({
  iceServers,
  forceTurnRelay: true,
  // ...
});
```

## Permission-denied UX в виджете

На скриншоте десктоп показывал «Разрешите доступ… нажмите Повторить», хотя пользователь видел `Камера/Микрофон: Разрешено` в браузере. Это classic-симптом: пользователь дал разрешение в **OS / parent page**, но iframe origin (`agent.neeklo.ru` внутри `demo.neeklo.ru`) **раньше уже получал deny** и Chrome помнит это per-origin даже при `allow="camera *"`.

В `apps/widget/src/app.tsx` добавил `describeMediaError(err)` — теперь показываем точную причину:

| `err.name` | Сообщение |
|---|---|
| `NotAllowedError` / `SecurityError` | «Разрешите доступ к камере и микрофону в адресной строке браузера (значок замка слева), затем нажмите «Повторить».» |
| `NotFoundError` / `OverconstrainedError` | «Камера или микрофон не найдены.» |
| `NotReadableError` | «Камера или микрофон заняты другим приложением.» |
| прочее | generic |

Плюс: если `getUserMedia` упал — виджет шлёт `webrtc:call-end` с причиной `PERMISSION_DENIED`, чтобы у оператора корректно закрылся попап исходящего звонка (а не висел в `CONNECTING`).

## Production verification

После деплоя в coturn логе **должно** появиться:

```
session NNN: usage: realm=<neeklo.ru>, ..., rp>0, rb>0, sp>0, sb>0
                                                          ↑      ↑
                                            обе стороны через TURN
```

И в API больше **нет** периодических `type=restart` каждые 12 секунд:

```
TURN_ISSUE ws=<id>
CALL_SIGNAL ... type=offer
CALL_SIGNAL ... type=ice (x10-30)
CALL_SIGNAL ... type=answer
CALL_SIGNAL ... type=ice (x10-30)
... (тишина — соединение стабильно)
```

В DevTools `chrome://webrtc-internals`:

- `iceConnectionState: connected` через 2-4 секунды после `setRemoteDescription`
- `selectedCandidatePair.local.type === 'relay'` И `remote.type === 'relay'` (оба!)
- `inbound-rtp.bytesReceived` и `outbound-rtp.bytesSent` растут синхронно с обеих сторон

## Изменённые файлы

| Файл | Что |
|---|---|
| `packages/rtc-runtime/src/types.ts` | `forceTurnRelay: boolean` (default true), удалено `relayFallbackMs`/`onRelayFallback` |
| `packages/rtc-runtime/src/index.ts` | Удалён `armRelayFallback`/`forceRelayFallback`, `iceTransportPolicy='relay'` передаётся в `PeerConnectionManager` при создании |
| `apps/widget/src/lib/widget-rtc-session.ts` | `forceTurnRelay: true`, fallback STUN servers |
| `apps/operator-panel/src/lib/operator-rtc-session.ts` | то же |
| `apps/widget/src/app.tsx` | `describeMediaError()` + `webrtc:call-end` с reason=PERMISSION_DENIED при ошибке |

## Trade-offs

| | Force-relay | P2P-first + fallback |
|---|---|---|
| **Гарантия соединения** | 100% если TURN жив | ~60-80% в реальном вебе |
| **Latency** | +20-50 мс (один hop) | минимум (direct) |
| **TURN bandwidth** | ~256 kbps на видео | только при необходимости |
| **Сложность кода** | минимальная | сложно (glare, race) |
| **Подходит для** | customer support, 1-to-1 | конференции, 5+ участников |

Для **customer-support видеозвонков** (что у нас) force-relay — отраслевой стандарт. Когда нагрузка вырастет, можно добавить второй coturn (geographic LB) — это уже про масштабирование, не про функциональность.

## Capacity coturn

Текущие лимиты в `/etc/turnserver.conf`:

```
total-quota=200       ← одновременных allocations
user-quota=10         ← на один username
max-bps=3000000       ← 3 Mbps на сессию (комфортно для 720p video)
```

Грубая оценка: при 200 одновременных видеозвонках = ~100 visitor-operator пар × 256 kbps × 2 направления ≈ **50 Mbps** исходящего трафика с TURN-сервера. Сервер `212.67.9.173` это держит без проблем.
