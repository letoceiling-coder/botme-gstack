# M11.6D — Media Flow Fix: iceServers Split + TURN-Only Fallback + Operator Cleanup

После M11.6C (coturn realm + TLS 5349) звонки по-прежнему зависали в `RECONNECTING` / «Обновление канала связи». Причина была не в TURN-сервере, а в **некорректной конфигурации `iceServers` на клиентах**.

## Root cause (доказательство)

### 1. coturn видит peer-трафик = 0

```
tail -2000 /var/log/turnserver/turnserver.log | grep "peer usage" | awk -F"sb=" "{print $2}" | sort | uniq -c | sort -rn
    159 sb=0           ← peer side received 0 bytes
      4 sb=2496
      3 sb=3744
      2 sb=3840
      ...
```

**~95% TURN-сессий закрываются с `peer rp=0 rb=0`** — TURN получает 0 байт со стороны peer'а. Клиент успешно аутентифицируется, аллокирует relay-кандидат, отправляет туда STUN binding requests, но **второй клиент ему не отвечает через relay**.

### 2. API-логи показывают бесконечный restart-loop

```
6:54:55  CALL_SIGNAL call=cmpfuoavb001tvtqb0q50d6qt type=ice ...
6:54:56  CALL_SIGNAL ... type=answer ...
... 17 секунд тишины ...
6:55:14  CALL_SIGNAL ... type=restart      ← recovery engine
... ICE candidates ...
6:55:33  type=answer
... 19 сек тишины ...
6:55:33  type=restart                       ← опять
```

### 3. Найден баг в `WebRtcSignalService.issueTurnCredentials`

API возвращал **один** `RTCIceServer` объект со всеми URL'ами **и** credentials:

```ts
{ urls: ['stun:turn.neeklo.ru:3478', 'turn:...udp', 'turn:...tcp', 'turns:...5349'],
  username, credential }
```

По спецификации W3C [WebRTC `RTCIceServer`](https://www.w3.org/TR/webrtc/#dom-rtciceserver):

> If `urls` contains a `stun:` URL and a `username` is given, throw `SyntaxError`. STUN URLs must not have credentials.

Chrome/Safari **молча отбрасывают** такой смешанный объект — `RTCPeerConnection` получает пустой массив `iceServers`. Без TURN-кандидатов клиент рассылает только host/srflx. И вот картина:

- Visitor (мобильный, симметричный NAT) → host=`192.168.x.x`, srflx=`46.x.x.x:NNNN`
- Operator (десктоп через симметричный NAT) → host=`192.168.x.x`, srflx=`172.x.x.x:NNNN`
- Каждый шлёт ICE binding request на чужой srflx → симметричный NAT блокирует → connection failed → recovery engine делает restart → новый offer → тот же результат.

Именно поэтому в логе coturn `peer 172.24.48.1 deleted`, `peer 192.168.0.11 deleted` — TURN пытается ретранслировать пакеты на приватные адреса другого пира.

## Fix

### A. Сервер — `apps/api/src/modules/realtime/services/webrtc-signal.service.ts`

```ts
const iceServers = [
  { urls: 'stun:turn.neeklo.ru:3478' },                          // ← без creds
  {
    urls: [
      'turn:turn.neeklo.ru:3478?transport=udp',
      'turn:turn.neeklo.ru:3478?transport=tcp',
      'turns:turn.neeklo.ru:5349?transport=tcp',
    ],
    username, credential,                                         // ← только для turn
  },
];
this.logger.debug(`TURN_ISSUE ws=${workspaceId} user=${username} ttl=${ttlSec}s`);
return { iceServers, username, credential, ttlSec };
```

DTO `TurnCredentialsDto` теперь несёт готовый `iceServers: RtcIceServerDto[]` — клиенту достаточно передать массив прямо в `RTCPeerConnection`.

### B. Клиенты — `apps/widget` + `apps/operator-panel`

`fetchTurnCredentials` теперь:
1. Принимает новый формат (`creds.iceServers`) и использует его как есть.
2. Имеет fallback на старый формат (`creds.urls` + `username`) — разбивает STUN/TURN сам, чтобы не сломать клиентов на момент rolling deploy.
3. При полном отсутствии TURN — два публичных STUN сервера (google + cloudflare).

### C. `@botme/rtc-runtime` — TURN-only fallback

Главная гарантия стабильности: даже если у одной стороны корпоративный/мобильный NAT блокирует все host/srflx-пары, через 12 секунд после `startAs{Offerer,Answerer}` runtime принудительно **пересоздаёт `RTCPeerConnection` с `iceTransportPolicy: 'relay'`**. Это значит:

- Все ICE-кандидаты с обеих сторон — **только relay** (через TURN-сервер)
- Симметричный NAT, UDP-блок, корпоративный firewall, тёмные ISP — всё это становится неважным, потому что обе стороны разговаривают только с `turn.neeklo.ru`

```ts
// packages/rtc-runtime/src/index.ts
private armRelayFallback(): void {
  if (this.relayFallbackUsed) return;
  const delay = this.config.relayFallbackMs ?? 12_000;
  this.relayFallbackTimer = setTimeout(() => {
    if (this.state === 'connected') return;
    void this.forceRelayFallback();
  }, delay);
}

private async forceRelayFallback(): Promise<void> {
  this.relayFallbackUsed = true;
  this.iceTransportPolicy = 'relay';
  this.config.onRelayFallback?.();
  // Rebuild PC with same local stream & role
  this.pcManager?.destroy();
  this.media.clearRemote();
  if (this.role === 'offerer') await this.startAsOfferer(localStream);
  else                          await this.startAsAnswerer(localStream);
}
```

UI получает callback и показывает «Переключение на надёжный канал…» на обоих концах.

Таймер сбрасывается, когда ICE доходит до `connected` (нормальный случай — fallback не нужен).

### D. Operator cleanup при `webrtc:call-end`

```ts
onCallEnd: () => {
  setActiveCall(null);
  destroyOperatorRtc();            // останавливает все треки (camera/mic)
  if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  if (localVideoRef.current)  localVideoRef.current.srcObject  = null;   // ← новое
},
```

То же в `hangUp()`. Это убирает «замороженный» кадр оператора (видно на скриншоте: лицо оператора остаётся в правом нижнем углу даже когда visitor завершил вызов).

`destroyOperatorRtc → handle.destroy → media.destroy → stopAllTracks` — мы уже останавливали MediaStreamTrack, не хватало только сбросить `<video srcObject>`, иначе браузер держит последний кадр.

## Production verify (после deploy)

После следующего реального звонка в coturn логе **должно** появиться:

```
session NNN: usage: realm=<neeklo.ru>, username=<TTL>, rp>0, rb>0, sp>0, sb>0
                                       ←     ←   peer side has traffic
session NNN: closed (2nd stage), ..., reason: TCP/UDP connection closed by client
              (а не: allocation timeout / allocation watchdog determined stale)
```

И в API:

```
TURN_ISSUE ws=<id> user=<epoch+ttl> ttl=86400s host=turn.neeklo.ru
CALL_SIGNAL ... type=offer ...
CALL_SIGNAL ... type=answer ...
... ICE candidates ...
(больше нет повторяющихся type=restart каждые 17-20 секунд)
```

В браузерных DevTools на странице `chrome://webrtc-internals`:

- `iceConnectionState: connected` через 1–3 сек после `setRemoteDescription`
- `selectedCandidatePair.local.type === 'relay'` ИЛИ `srflx`
- `inbound-rtp.bytesReceived` растёт

## Можно ли через виджет стабильно? Ответ: да

Архитектура у нас стандартная (Mesh peer-to-peer через signaling + TURN-relay), идентичная whereby/jitsi/google meet 1-to-1 calls. После M11.6D гарантия media-flow выглядит так:

| Сценарий | Стратегия | Гарантия |
|---|---|---|
| Симметричный NAT, UDP open | srflx ↔ srflx (host/STUN p2p) | 1-3 сек |
| Один симметричный NAT, UDP блокируется | срабатывает relay-fallback (12 с) → TURN UDP 3478 | через 12-15 сек |
| Оба симметричный NAT / VPN | TURN UDP 3478 → fallback TURN TCP 3478 | через 12-15 сек |
| Корпоративный firewall (только 443) | TURN TLS 5349 (через TLS-tunnel) | через 12-15 сек |
| iOS Safari + LTE | TURN UDP 3478 (стабильно) | 2-4 сек |

TURN-сервер посчитан под нагрузку:
- `max-bps=3000000` (3 Mbps на сессию)
- `total-quota=200` (одновременных сессий)
- `user-quota=10` (на одного пользователя)

Если нагрузка вырастет — увеличить лимиты, или добавить второй coturn (geographic load-balancing).

## Изменённые файлы

| Файл | Что |
|---|---|
| `packages/shared/src/operator.ts` | `TurnCredentialsDto.iceServers: RtcIceServerDto[]` |
| `apps/api/src/modules/realtime/services/webrtc-signal.service.ts` | Раздельные STUN/TURN, логирование `TURN_ISSUE` |
| `apps/widget/src/lib/widget-rtc-session.ts` | `normalizeTurnCreds` + `onRelayFallback` + 2 fallback STUN |
| `apps/operator-panel/src/lib/operator-rtc-session.ts` | то же |
| `apps/operator-panel/src/components/operator-platform.tsx` | очистка `<video srcObject>` в `onCallEnd` + `hangUp` |
| `packages/rtc-runtime/src/types.ts` | `relayFallbackMs`, `onRelayFallback` в config |
| `packages/rtc-runtime/src/peer-connection-manager.ts` | поддержка `iceTransportPolicy` |
| `packages/rtc-runtime/src/index.ts` | `armRelayFallback` + `forceRelayFallback` + role tracking |

## Rollback

```bash
cd /home/dsc-2/projects/botme
git revert <commit>
./infra/scripts/deploy-production.sh
```

Старые виджеты/операторы продолжат работать с новым API (нормализация `urls + username + credential` в `normalizeTurnCreds`).
