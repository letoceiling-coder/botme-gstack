# M11.6G — Bug-fixes: пропавшее локальное видео + ICE-collapse без TURN

## Bug #1 (КРИТИЧЕСКИЙ): локальная камера никогда не показывалась в виджете

### Симптом
В `widget-call-active` маленькая рамка локального превью (`widget-call-local` 96×72) **всегда пустая** на всех устройствах. У оператора превью работает. Пользователь думает что камера не подключилась.

### Корневая причина (timing race в React)

В `onAcceptCall` логика была:

```ts
mediaPromise.then((localStream) => {
  setCallInvite(null);
  // ❌ localVideoRef.current === null здесь
  if (localVideoRef.current) {
    localVideoRef.current.srcObject = localStream;
  }
  setCallState('REQUESTING_MEDIA');
  return acceptCallWithStream(...);
})
.then((ok) => {
  if (ok) setInCall(true);  // ← только ТЕПЕРЬ React монтирует <video>
});
```

А JSX рендерил `<video ref={localVideoRef}>` **только когда `inCall===true`**:

```jsx
{inCall && (
  <div className="widget-call-active">
    <video ref={localVideoRef} ... />
  </div>
)}
```

Получалось: пытаемся присвоить `srcObject` ref'у которого ещё нет в DOM. Через несколько сотен мс `setInCall(true)` коммитится, ref подключается, **но `srcObject` ему уже никто не присваивает**. **Локальная камера никогда не показывается, даже если `getUserMedia` отработал успешно.**

### Fix

1. `localStream` и `remoteStream` теперь в **state**, не в ref-call-time
2. Call panel монтируется **сразу** после `getUserMedia` (`setInCall(true)` до `acceptCallWithStream`)
3. `useEffect([localStream, inCall])` присваивает `srcObject` каждый раз когда либо stream либо ref меняется — независимо от порядка React commit'ов

```ts
const [localStream, setLocalStream] = useState<MediaStream | null>(null);
const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

useEffect(() => {
  if (localVideoRef.current && localStream) {
    localVideoRef.current.srcObject = localStream;
    void localVideoRef.current.play().catch(() => undefined);
  }
}, [localStream, inCall]);
```

В `onAcceptCall`:
```ts
.then((stream) => {
  setLocalStream(stream);
  setInCall(true);  // ← mount BEFORE acceptCallWithStream resolves
  ...
})
```

## Bug #2 (КРИТИЧЕСКИЙ): ICE-collapse когда TURN credentials timeout

### Симптом
В TURN-логах: одна сторона аллоцирует и шлёт 10 КБ медиа через relay, **вторая сторона никогда не делает Create-Permission** → TURN дропает пакеты → `allocation timeout`. Звонок зависает на "Подключение…/Переподключение…".

### Корневая причина

В widget-rtc-session.ts:
```ts
async function fetchTurnCredentials(socket) {
  const timeout = setTimeout(() => resolve(FALLBACK_ICE_SERVERS), 5000); // STUN ONLY!
  socket.once('webrtc:turn-credentials', ...);
  socket.emit('webrtc:turn-credentials');
}

// ...
runtime = new RtcRuntime({
  iceServers,
  forceTurnRelay: true,  // ← всегда true
  ...
});
```

Когда `webrtc:turn-credentials` ack приходил с задержкой >5 сек (mobile data, медленный API, lock-step с другим запросом), клиент откатывался на STUN-only fallback. И **сразу же** включал `iceTransportPolicy: 'relay'` через `forceTurnRelay: true`.

При этом сценарии у `RTCPeerConnection`:
- Локальные кандидаты: **нет relay** (нет TURN серверов в iceServers) → не генерируются
- `iceTransportPolicy='relay'` фильтрует **все** non-relay кандидаты
- Результат: **0 локальных кандидатов** → **0 candidate pair'ов** → ICE **никогда** не connect

Это объясняло `allocation timeout` со стороны второй стороны: операторская сторона **успешно** аллоцировала и шлёт медиа на свой relay, виджет получал relay-candidate оператора, **но не использовал его** потому что у виджета своих relay-кандидатов нет (видимость candidate pair требует local relay × remote relay).

### Fix

`fetchTurnCredentials` теперь возвращает **флаг `hasTurn`**:

```ts
async function fetchTurnCredentials(socket): Promise<{ iceServers; hasTurn }> {
  // ... timeout 10s (было 5s)
  const iceServers = normalizeTurnCreds(creds);
  const hasTurn = iceServers.some((s) =>
    [...].some((u) => u.startsWith('turn:') || u.startsWith('turns:'))
  );
  return { iceServers, hasTurn };
}
```

И `forceTurnRelay` теперь зависит от наличия TURN:
```ts
runtime = new RtcRuntime({
  iceServers,
  forceTurnRelay: hasTurn, // ← true только если TURN реально в списке
});
```

Если TURN недоступен (deploy bug, network issue) — `iceTransportPolicy='all'` даёт ICE шанс через host/srflx кандидаты, вместо полного collapse'а.

То же сделано в `operator-panel/src/lib/operator-rtc-session.ts`.

## Bug #3: TURN credentials timeout слишком короткий

Был 5 сек. Это маленький запас для mobile data + WebSocket round-trip + API DB-lookup. **Увеличил до 10 сек** в обоих клиентах. Если за 10 сек TURN не пришёл — есть **fallback на STUN** + relay-policy отключается (Bug #2).

## Bug #4: Stale streams после завершения звонка

Когда `webrtc:call-end` приходил от оператора, виджет **не останавливал локальные tracks** — камера/микрофон оставались активными после "разговора". Браузер показывал индикатор записи камеры даже когда звонок закончился. Fix: stop all tracks в обработчике + сбросить state.

## Файлы изменены

- `apps/widget/src/app.tsx` — useEffect для srcObject, state для streams, монтирование call panel сразу, cleanup на call-end
- `apps/widget/src/lib/widget-rtc-session.ts` — TURN timeout 10s, `hasTurn` флаг, conditional forceTurnRelay
- `apps/operator-panel/src/lib/operator-rtc-session.ts` — то же
- `docs/M11_6G_LOCAL_VIDEO_AND_ICE_COLLAPSE_FIX.md` (этот)

## Deployment

```
✓ widget bundle: embed-LrzHRzEA.js (deployed)
✓ operator bundle: embed-BCpmosUF.js (deployed)
✓ index.html refs new bundles (cache-bust headers пропускают свежие)
✓ no TS errors, no lint errors
```

## Что должен сделать пользователь

1. **Hard refresh** обеих страниц (Ctrl+Shift+R) — на мобильнике зайти заново и обновить браузер
2. На `https://demo.neeklo.ru/` нажать иконку виджета → подождать инициализации
3. На `https://demo.neeklo.ru/operator` войти → выбрать диалог → "Видеозвонок"
4. На виджете нажать "Принять"

### Ожидаемое поведение (теперь)

| Стадия | Что увидит пользователь |
|---|---|
| Клик "Принять" | Браузер запрашивает доступ к камере/микрофону |
| Доступ дан | **Сразу** появляется превью своей камеры в правом-нижнем углу |
| Прогресс | Текст "Подключение…" |
| 5-15 сек | (ICE через TURN устанавливает связь) |
| Соединение установлено | Видео оператора в большом окне, текст "Соединение установлено" |

Если **камера не показывается даже у себя** — значит проблема в `getUserMedia`. Проверь:
- Адресная строка → значок камеры → "Разрешить"
- На Android в Chrome: `chrome://settings/content/camera`
- На Android: настройки → приложения → Chrome → разрешения → камера

Если **локальная камера видна, но звонок висит "Подключение…" >30 сек** — это уже сетевая/TURN проблема, скинь скриншот.

## Rollback

```bash
git revert <m11.6g commit>
pnpm build
rsync -av apps/widget/dist/ root@212.67.9.173:/var/www/agent.neeklo.ru/apps/widget/dist/
rsync -av apps/operator-panel/dist/ root@212.67.9.173:/var/www/agent.neeklo.ru/apps/operator-panel/dist/
```
