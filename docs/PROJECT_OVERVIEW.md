# Botme / agent.neeklo.ru — полное описание проекта

Документ описывает текущее состояние проекта по коду в репозитории `agent.neeklo.ru`: архитектуру, приложения, страницы, backend-модули, модель данных, публичный виджет, операторскую панель, AI runtime, RAG, realtime, RTC, worker и production-deploy.

## 1. Назначение проекта

Botme — multi-tenant SaaS-платформа для создания AI-ассистентов, подключения AI-моделей, баз знаний, инструментов, публичных виджетов на сайты и операторского realtime-канала.

Главная продуктовая идея:

- workspace содержит пользователей, интеграции, агентов, ассистентов, базы знаний, инструменты, виджеты, диалоги и лиды;
- агент отвечает за AI runtime: провайдер, модель, prompt versions, параметры генерации и fallback-модели;
- ассистент собирает продуктовую конфигурацию: какой агент использовать, какие KB/tools подключить, какие тексты и runtime-настройки применять;
- виджет публикует ассистента на сайт через `widget.js` и iframe `/widget/`;
- операторская панель позволяет видеть посетителей, перехватывать чат, писать от оператора и запускать voice/video calls;
- backend хранит состояние в PostgreSQL, использует Redis/BullMQ для фоновых задач и realtime/RTC state, S3-compatible storage для файлов и nginx/PM2 для production.

## 2. Monorepo

Репозиторий — PNPM/Turbo monorepo.

Корневой `package.json`:

- `pnpm build` запускает `turbo run build`;
- `pnpm dev` запускает `turbo run dev --parallel`;
- `pnpm lint` запускает `turbo run lint`;
- `pnpm typecheck` запускает `turbo run typecheck`;
- `pnpm test` запускает `turbo run test`;
- `pnpm db:generate`, `db:migrate`, `db:migrate:deploy`, `db:push` работают через `@botme/database`;
- Node version: `>=20`;
- package manager: `pnpm@9.15.4`.

Основные приложения:

- `apps/api` — NestJS API, auth, CRUD, runtime orchestration, realtime gateways, public widget/operator endpoints.
- `apps/web` — основная админка React/Vite.
- `apps/widget` — публичный виджет: loader `widget.js` и iframe-приложение `/widget/`.
- `apps/operator-panel` — изолированная операторская панель для live visitors, takeover, chat, RTC.
- `apps/worker` — BullMQ worker для синхронизации моделей и ingestion базы знаний.
- `apps/demo-site` — демонстрационное приложение.

Основные packages:

- `packages/shared` — DTO, Zod-схемы, RBAC, shared constants, contracts для frontend/backend.
- `packages/database` — Prisma schema/client, PostgreSQL + pgvector.
- `packages/ai-core` — базовые AI abstraction primitives.
- `packages/ai-runtime` — runtime исполнения моделей и provider calls.
- `packages/realtime-runtime` — realtime contracts/utilities.
- `packages/rtc-runtime` — WebRTC runtime, state machine, quality classification, diagnostics.
- `packages/crypto` — криптографические helpers, encryption.
- `packages/ui` — общие UI-компоненты.
- `packages/vector` — vector/search helpers.

## 3. Production layout

Production baseline:

- домен: `agent.neeklo.ru`;
- сервер: `/var/www/agent.neeklo.ru`;
- API process: `agent-botme-api`, порт `3110`;
- web process: `agent-botme-web`, Vite preview на `4173`;
- worker process: `agent-botme-worker`;
- reverse proxy: nginx;
- process manager: PM2;
- PostgreSQL: основная БД, Prisma;
- Redis: BullMQ, realtime/RTC state;
- S3-compatible storage: файлы KB и widget assets;
- TURN/coturn: WebRTC NAT traversal.

`ecosystem.config.cjs` поднимает:

- `agent-botme-api` через `pnpm --filter @botme/api start`, `API_PORT=3110`;
- `agent-botme-worker` через `pnpm --filter @botme/worker start`;
- `agent-botme-web` через `pnpm --filter @botme/web preview --host 0.0.0.0 --port 4173 --strictPort`.

Nginx:

- `/api/` проксирует в API;
- `/socket.io/` проксирует Socket.IO;
- `/widget.js` отдаёт loader из `apps/widget/dist/widget.js`;
- `/widget/` отдаёт iframe widget app;
- `/widget/assets/*` отдаёт hashed assets immutable;
- `/operator-panel/`, `/operator-panel.js`, `/operator.js`, `/operator-runtime/` обслуживают операторский runtime;
- `/storage/` проксирует S3-compatible storage;
- `/` отдаёт admin web app.

Кеширование:

- `widget.js` должен отдаваться с `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`;
- `/api/public/widget/:key/init` отдаёт `no-store`;
- `/widget/` index отдаётся `no-cache`;
- `/widget/assets/*` immutable, потому что Vite генерирует hash filenames;
- widget iframe получает `v=assetVersion`, где `assetVersion` берётся из `WidgetInstance.updatedAt`.

Deploy pipeline находится в `infra/scripts/deploy-production.sh`.

Шаги deploy:

- проверка clean git через `require-clean-git.sh`;
- staging safety scripts;
- preflight;
- snapshot rollback checkpoint;
- CI gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`;
- rsync `dist` артефактов API/web/widget/operator-panel/worker;
- rsync packages `ai-core`, `ai-runtime`, `realtime-runtime`, `rtc-runtime`, `shared`, `database`, `crypto`;
- rsync migrations/schema/nginx/ecosystem;
- remote `pnpm install`, Prisma generate/migrate deploy;
- PM2 start/restart;
- nginx test/reload;
- production health verification;
- release metadata.

## 4. Backend architecture

`apps/api` — NestJS приложение.

`main.ts`:

- загружает `.env`;
- создаёт Nest app;
- подключает realtime adapter;
- включает `cookieParser`;
- включает global `ValidationPipe` с `whitelist`, `forbidNonWhitelisted`, `transform`;
- включает CORS из `CORS_ORIGINS`;
- слушает `API_PORT`, по умолчанию `3010`, production использует `3110`.

`app.module.ts`:

- подключает `ConfigModule`;
- включает `ThrottlerModule` с лимитом 120 запросов за 60 секунд;
- подключает все доменные модули;
- глобально регистрирует guards:
  - `ThrottlerGuard`;
  - `JwtAuthGuard`;
  - `WorkspaceGuard`;
  - `RolesGuard`.

Core:

- `CoreModule` глобальный;
- предоставляет `PrismaService`, `RedisService`, `CorsOriginsService`.

Foundation:

- общие сервисы, используемые модулями;
- audit;
- widget auth;
- preview token;
- runtime snapshots;
- storage/security helpers.

## 5. Auth, workspace и RBAC

Auth module:

- `POST /auth/register` — регистрация пользователя и workspace;
- `POST /auth/login` — вход;
- `POST /auth/refresh` — обновление сессии;
- `POST /auth/logout` — выход;
- `GET /auth/me` — текущая сессия;
- `POST /auth/switch-workspace` — переключение workspace.

Auth использует:

- JWT access flow;
- refresh tokens;
- httpOnly cookie flow;
- workspace membership;
- RBAC roles.

Workspace module:

- `GET /workspaces` — список доступных workspace;
- `GET /workspaces/current/summary` — summary текущего workspace;
- `POST /workspaces` — создание workspace.

Workspace members:

- `GET /workspaces/current/members`;
- `GET /workspaces/current/members/invites`;
- `POST /workspaces/current/members/invite`;
- `DELETE /workspaces/current/members/invites/:inviteId`;
- `PATCH /workspaces/current/members/:memberId`;
- `DELETE /workspaces/current/members/:memberId`.

Роли:

- `OWNER`;
- `ADMIN`;
- `OPERATOR`;
- `MEMBER`;
- `VIEWER`.

RBAC находится в `packages/shared/src/rbac.ts`, guards — в `apps/api/src/core/guards`.

## 6. AI integrations

Integration module отвечает за подключение AI providers.

Поддерживаемые enum-провайдеры в Prisma:

- `OPENAI`;
- `OPENROUTER`;
- `ANTHROPIC`;
- `GEMINI`;
- `OLLAMA`;
- `OLLAMA_NEEKLO`;
- `GROQ`;
- `DEEPSEEK`;
- `TOGETHER`;
- `MISTRAL`.

Admin API:

- `GET /integrations`;
- `POST /integrations`;
- `PATCH /integrations/:id`;
- `DELETE /integrations/:id`;
- `POST /integrations/:id/validate`;
- `POST /integrations/:id/sync-models`;
- `GET /integrations/:id/models`.

Frontend page: `apps/web/src/pages/integrations-page.tsx`.

На странице:

- показаны provider cards;
- можно создать интеграцию;
- можно выбрать provider;
- можно указать имя, ключ, default flag;
- можно валидировать интеграцию;
- можно синхронизировать модели;
- можно удалить интеграцию;
- можно открыть список моделей;
- можно редактировать model chain через `IntegrationModelChainEditor`.

Model sync:

- запускается API endpoint `POST /integrations/:id/sync-models`;
- worker `apps/worker/src/jobs/sync-models.worker.ts` синхронизирует модели;
- результаты сохраняются в `AiModelCache`;
- model chain хранится в `IntegrationModelChainItem`.

Секреты интеграций:

- в БД хранятся encrypted bytes;
- используется security/encryption layer;
- UI показывает masked key.

## 7. Agents

Agent — runtime-конфигурация модели.

Основные поля модели `Agent`:

- workspace;
- integration;
- name/description;
- modelId;
- systemPrompt;
- status;
- temperature;
- topP;
- maxTokens;
- streamingEnabled;
- toolsEnabled;
- prompt versions;
- model fallbacks.

Agent API:

- `GET /agents`;
- `GET /agents/:id/runtime-diagnostics`;
- `GET /agents/:id`;
- `POST /agents`;
- `PATCH /agents/:id`;
- `DELETE /agents/:id`;
- `POST /agents/:id/prompts`;
- `POST /agents/:id/prompts/:version/activate`.

Frontend pages:

- `apps/web/src/pages/agents-page.tsx`;
- `apps/web/src/pages/agent-editor-page.tsx`;
- `apps/web/src/pages/agent-playground-page.tsx`.

`AgentsPage`:

- список агентов;
- создание агента;
- редактирование basic runtime;
- выбор active integration;
- выбор modelId из cache;
- создание fallback chain;
- archive action;
- переход в editor;
- переход в playground.

`AgentEditorPage`:

- sidebar секции:
  - `Промпт`;
  - `Runtime`;
  - `Fallback chain`;
  - `Diagnostics`;
- редактор prompt versions;
- подсчёт примерных токенов;
- diff prompt versions;
- сохранение prompt version;
- активация prompt version;
- runtime настройки:
  - integration;
  - model;
  - temperature;
  - topP;
  - maxTokens;
  - streamingEnabled;
  - toolsEnabled;
  - fallbacks;
- runtime diagnostics panel;
- просмотр active assistant runtime snapshot, если агент связан с ассистентом.

Fallbacks:

- хранятся в `AgentModelFallback`;
- содержат integrationId/modelId;
- имеют enabled flag;
- maxRetries;
- timeoutMs;
- порядок;
- используются runtime router-логикой.

## 8. Assistants

Assistant — продуктовая сборка поверх агента.

Основные поля:

- workspace;
- agentId;
- name;
- slug;
- avatarUrl;
- language;
- welcomeMessage;
- placeholder;
- tone;
- visibility;
- status;
- escalation;
- runtime settings;
- linked knowledge bases;
- linked tools;
- runtime snapshots;
- widgets.

Assistant API:

- `GET /assistants`;
- `GET /assistants/:id`;
- `POST /assistants`;
- `PATCH /assistants/:id`;
- `DELETE /assistants/:id`;
- `POST /assistants/:id/agent`;
- `POST /assistants/:id/kbs`;
- `POST /assistants/:id/tools`;
- `GET /assistants/:id/runtime`.

Frontend pages:

- `apps/web/src/pages/assistants-page.tsx`;
- `apps/web/src/pages/assistant-detail-page.tsx`;
- `apps/web/src/pages/assistant-runtime-page.tsx`;
- `apps/web/src/pages/assistant-chat-page.tsx`.

`AssistantDetailPage` tabs:

- `General`;
- `Runtime`;
- `Knowledge`;
- `Tools`;
- `Widget`;
- `RTC`.

General:

- name;
- avatar URL;
- language;
- welcome message;
- placeholder;
- tone.

Runtime:

- выбрать linked agent;
- сохранить runtime settings:
  - maxContextMessages;
  - memoryEnabled;
  - streamingEnabled;
  - citationsEnabled;
  - moderationEnabled;
  - fallbackMessage;
  - typingSimulation;
- показать active snapshot:
  - model;
  - integration;
  - provider;
  - prompt version;
  - KB count;
  - tool count.

Knowledge:

- выбрать базы знаний, которые ассистент будет использовать.

Tools:

- выбрать tools, доступные ассистенту.

Widget:

- выбрать связанный виджет;
- редактировать дизайн через `WidgetStyleEditor`;
- выбрать один из design presets;
- настроить цвета;
- загрузить SVG/PNG launcher icon;
- настроить title/welcome/avatar/quick actions;
- сохранить `launcherConfig` в `WidgetInstance`.

RTC:

- audioEnabled;
- videoEnabled;
- takeoverPolicy;
- reconnectPolicy;
- turnPolicy.

Runtime snapshots:

- модель `AssistantRuntimeSnapshot`;
- snapshot фиксирует состояние ассистента, агента, интеграции, prompt version, KB/tools;
- нужен для стабильного выполнения runtime и воспроизводимости.

## 9. Assistant test chat

Assistant test chat позволяет тестировать ассистента из админки.

API:

- `GET /assistants/:id/test-chat/session`;
- `DELETE /assistants/:id/test-chat/session`.

Realtime:

- используется admin socket;
- событие `assistant:chat:start`;
- stream events:
  - `assistant:chat:started`;
  - `assistant:chat:chunk`;
  - `assistant:chat:done`;
  - `assistant:chat:error`;
- cancel event:
  - `assistant:chat:cancel`.

Frontend: `apps/web/src/pages/assistant-chat-page.tsx`.

Страница:

- показывает chat history;
- отправляет сообщения;
- слушает stream chunks;
- показывает citations;
- показывает usage;
- умеет отменять stream;
- умеет очищать test chat session;
- требует роль минимум `MEMBER`.

## 10. Playground

Playground относится к агенту.

API:

- `GET /playground/sessions/:agentId`;
- `DELETE /playground/sessions/:sessionId`;
- `POST /playground/sessions/:sessionId/cancel`.

Данные:

- `PlaygroundSession`;
- `PlaygroundMessage`.

Назначение:

- тестирование агента до привязки или независимо от ассистента;
- хранение playground-сессии;
- cancel generation.

## 11. Knowledge Base / RAG

Knowledge module отвечает за базы знаний, документы, chunking, embeddings и retrieval.

API:

- `GET /knowledge-bases`;
- `GET /knowledge-bases/:id`;
- `POST /knowledge-bases`;
- `PATCH /knowledge-bases/:id`;
- `DELETE /knowledge-bases/:id`;
- `GET /knowledge-bases/:id/documents`;
- `GET /knowledge-bases/:id/documents/:docId`;
- `POST /knowledge-bases/:id/documents/upload-url`;
- `POST /knowledge-bases/:id/documents/upload`;
- `GET /knowledge-bases/:id/ingestion-status`;
- `GET /knowledge-bases/:id/diagnostics`;
- `POST /knowledge-bases/:id/heal`;
- `POST /knowledge-bases/:id/documents/text`;
- `PATCH /knowledge-bases/:id/documents/:docId/text`;
- `POST /knowledge-bases/:id/documents/:docId/rollback-upload`;
- `POST /knowledge-bases/:id/documents/text/preview-chunks`;
- `POST /knowledge-bases/:id/documents/url`;
- `POST /knowledge-bases/:id/documents/:docId/confirm`;
- `POST /knowledge-bases/:id/documents/:docId/retry`;
- `GET /knowledge-bases/:id/documents/:docId/chunks`;
- `POST /knowledge-bases/:id/retrieve-test`;
- `DELETE /knowledge-bases/:id/documents/:docId`.

Frontend: `apps/web/src/pages/knowledge-page.tsx`.

Страница Knowledge:

- список KB;
- поиск KB;
- создание KB;
- выбор активной KB;
- список документов;
- поиск документов;
- фильтр статуса;
- загрузка файла;
- добавление URL;
- текстовый редактор документа;
- autosave через `useDebouncedSave`;
- preview chunks;
- просмотр chunks;
- поиск chunks;
- retrieval test;
- retry failed document;
- удаление документа;
- удаление KB.

Поддерживаемые source types:

- `TEXT`;
- `FILE`;
- `URL`.

Статусы документа:

- `PENDING`;
- `UPLOADED`;
- `QUEUED`;
- `PARSING`;
- `CHUNKING`;
- `EMBEDDING`;
- `INDEXED`;
- `FAILED`;
- `RETRYING`;
- `DELETED`.

RAG flow:

- документ создаётся или загружается;
- файл сохраняется в S3-compatible storage;
- документ ставится в очередь;
- worker парсит контент;
- контент режется на chunks;
- embeddings сохраняются в `KbChunk.embedding` через pgvector;
- retrieval ищет релевантные chunks;
- assistant runtime добавляет citations, если `citationsEnabled`.

Worker:

- `apps/worker/src/jobs/kb-ingestion.worker.ts`;
- `apps/worker/src/jobs/kb-crawl.ts`;
- `apps/worker/src/parsers/register-parsers.ts`;
- `apps/worker/src/services/neeklo-parser.client.ts`;
- `apps/worker/src/services/neeklo-parser-to-kb.ts`.

## 12. Tools runtime

Tools module отвечает за runtime tools, их настройки, включение/выключение, тестирование и execution logs.

Tool API:

- `GET /tools`;
- `GET /tools/:id`;
- `PATCH /tools/:id`;
- `POST /tools/:id/test`.

Frontend:

- `apps/web/src/pages/tools-page.tsx`;
- `apps/web/src/pages/tool-detail-page.tsx`.

`ToolsPage`:

- показывает карточки инструментов;
- статус: active/disabled/errors;
- category;
- type;
- execution count;
- average latency;
- переход к detail page.

Tool types:

- `CALCULATOR`;
- `HTTP_REQUEST`;
- `LEAD_SAVER`;
- `RAG_SEARCH`;
- `MEMORY`;
- `WEBHOOK`;
- `WEB_SEARCH`;
- `EMAIL_STUB`;
- `CRM_NOTE`;
- `CUSTOM`.

Execution:

- `ToolExecution` хранит input/output/status/latency/error;
- статусы:
  - `PENDING`;
  - `SUCCESS`;
  - `FAILED`;
  - `TIMEOUT`.

Инструменты могут быть привязаны к ассистентам через `AssistantTool`.

## 13. Leads

Lead module отвечает за лиды из виджета, test chat/API/manual sources и Lead Saver tool.

API:

- `GET /leads`;
- `GET /leads/export.csv`;
- `PATCH /leads/:id`.

Frontend: `apps/web/src/pages/leads-page.tsx`.

Страница:

- фильтр по status;
- поиск по имени/email/телефону;
- список лидов;
- изменение статуса;
- экспорт CSV;
- переход к связанному assistant chat, если есть conversation.

Lead statuses:

- `NEW`;
- `CONTACTED`;
- `QUALIFIED`;
- `CLOSED`;
- `SPAM`.

Lead sources:

- `WIDGET`;
- `TEST_CHAT`;
- `API`;
- `MANUAL`.

## 14. Widgets / Connection Center

Widget — публичный канал на сайт.

Модель:

- `WidgetInstance`;
- связан с workspace и assistant;
- имеет publicKey;
- имеет `launcherConfig`;
- имеет domains;
- имеет conversations;
- имеет visitor sessions;
- может иметь operator runtime tokens.

Widget admin API:

- `GET /widgets`;
- `GET /widgets/:id/connection-center`;
- `POST /widgets/:id/operator-connection/provision`;
- `GET /widgets/:id/operator-embed/validation`;
- `GET /widgets/:id/health`;
- `GET /widgets/:id/preview-session`;
- `GET /widgets/:id`;
- `POST /widgets`;
- `PATCH /widgets/:id`;
- `POST /widgets/:id/launcher-icon`;
- `PUT /widgets/:id/domains`;
- `DELETE /widgets/:id`.

Public widget API:

- `GET /api/public/widget/:publicKey/init`.

Frontend admin: `apps/web/src/pages/widgets-page.tsx`.

`WidgetsPage`:

- список виджетов;
- создание виджета;
- выбор ассистента;
- указание разрешённых доменов;
- включение/выключение виджета;
- удаление;
- Connection Center tabs:
  - `Виджет`;
  - `Кабинет оператора`;
  - `Операторы`;
  - `RTC`;
  - `Диагностика`;
  - `Self-host`;
- live health;
- widget sockets count;
- operator sockets count;
- operator URLs;
- live preview iframe.

Widget tab:

- показывает workspace/assistant/RTC/status;
- показывает install steps;
- показывает embed code;
- содержит `WidgetStyleEditor`;
- позволяет сохранять дизайн виджета;
- показывает allowed domains;
- показывает инструкцию подключения операторов.

Widget style editor:

- 10 дизайн-пресетов:
  - Neeklo Neon;
  - Telegram;
  - WhatsApp;
  - iMessage;
  - Messenger;
  - Slack;
  - Instagram;
  - Minimal Light;
  - Midnight Pro;
  - Glassmorphism;
- primary/secondary/text colors;
- launcher icon text;
- launcher icon URL;
- загрузка SVG/PNG launcher icon;
- widget title;
- avatar URL;
- welcome;
- quick replies;
- dark theme;
- animations;
- compact mode.

`launcherConfig` хранится в JSON `WidgetInstance.launcherConfig`.

Public init:

- проверяет publicKey и origin/domain через widget auth;
- нормализует launcher config;
- подставляет fallback welcome/title/avatar из assistant;
- возвращает:
  - publicKey;
  - widgetOrigin;
  - embedPath;
  - assetVersion;
  - theme;
  - assistant name/welcome.

## 15. Public widget runtime

`apps/widget` состоит из двух частей:

- loader `apps/widget/loader/loader.ts`, собирается в `/widget.js`;
- iframe React app `apps/widget/src/app.tsx`, доступен по `/widget/`.

Loader:

- читает `data-widget-key`;
- определяет `apiOrigin` и `widgetOrigin`;
- не вставляет виджет дважды, если `botme-widget-host` уже есть;
- fetch `/api/public/widget/:key/init`;
- создаёт launcher button;
- создаёт iframe `/widget/?widgetKey=...&v=assetVersion`;
- применяет позицию, размеры, borderRadius, цвета;
- поддерживает `launcherIconUrl` через `<img>`;
- поддерживает fullscreenMobile;
- слушает `BOTME_CLOSE` message из iframe;
- прячет launcher при открытом iframe.

Iframe app:

- подключается к Socket.IO namespace widget;
- отправляет `widget:init`;
- восстанавливает visitorId/conversationId из localStorage;
- получает `widget:session`;
- применяет theme через `applyWidgetTheme`;
- показывает header, online/offline/reconnecting state;
- показывает welcome message;
- показывает quick actions;
- отправляет сообщения;
- показывает stream chunks;
- обрабатывает duplicate realtime event ids;
- использует anchored scroll;
- поддерживает typing state;
- поддерживает operator connected state;
- поддерживает call controls;
- поддерживает incoming voice/video call invite;
- запрашивает camera/microphone;
- показывает permission errors;
- хранит call recovery state;
- поддерживает reconnect/ICE recovery.

Widget events:

- `widget:session`;
- `widget:started`;
- `widget:stream-reset`;
- `widget:chunk`;
- `widget:done`;
- `widget:error`;
- `widget:typing`;
- `widget:operator-connected`;
- `widget:call-invite`;
- `webrtc:signal`;
- `webrtc:call-end`;
- `webrtc:peer-reconnected`.

Theme:

- `packages/shared/src/widgets-admin.ts` задаёт schema;
- `packages/shared/src/widget-theme.ts` нормализует config и CSS variables;
- `apps/widget/src/lib/theme.ts` применяет CSS vars и data attributes:
  - `data-botme-preset`;
  - `data-botme-dark`;
  - `data-botme-compact`;
  - `botme-no-animations`.

## 16. Operator panel

Operator panel — отдельное приложение `apps/operator-panel`.

В админке `/admin/operator` открывает iframe `/operator-panel/`.

`OperatorPlatform`:

- подключается к operator socket;
- получает live visitors;
- фильтрует посетителей по widget;
- ищет по visitorId/widget/device;
- показывает unread counters;
- выбирает visitor session;
- fetch conversation;
- показывает chat messages;
- отправляет operator messages;
- показывает visitor typing;
- takeover chat;
- release chat;
- включает call controls;
- запускает voice/video call;
- принимает incoming offer;
- обрабатывает WebRTC signals;
- показывает call overlay;
- показывает local/remote video;
- показывает network quality hints;
- хранит call recovery token;
- поддерживает workspace switching;
- подтягивает widget names/counts.

Operator socket actions:

- takeover;
- release;
- typing;
- fetch conversation;
- send message;
- enable call controls;
- call invite;
- webrtc signal;
- call end;
- recovery.

Operator runtime/public:

- `GET /api/public/operator/:publicKey/init`;
- `POST /api/public/operator-runtime/session`;
- operator runtime tokens управляются через `/widgets/:widgetId/operator-tokens`;
- self-host zip доступен через `/widgets/:widgetId/operator-self-host.zip`.

## 17. Realtime architecture

Realtime module:

- `AdminGateway`;
- `WidgetGateway`;
- `OperatorGateway`;
- `RealtimeRuntimeService`;
- `LiveVisitorTrackerService`;
- `OperatorSessionLockService`;
- `WebRtcSignalService`;
- `RealtimeDiagnosticsService`;
- `WidgetSocketBridge`;
- `OperatorSocketBridge`;
- `AdminSocketBridge`;
- `ActiveCallRegistryService`;
- `RtcSignalRelayService`;
- `RtcRedisStoreService`;
- `RtcCallRecoveryService`;
- `RtcDiagnosticsBroadcastService`;
- `ChatRealtimeBroadcastService`;
- `OperatorChatService`.

Namespaces:

- admin;
- widget;
- operator.

Realtime responsibilities:

- authenticated admin socket;
- widget public socket;
- operator socket;
- live visitor tracking;
- operator takeover/release;
- chat broadcasting;
- typing indicators;
- realtime assistant streaming;
- RTC signaling relay;
- active call registry;
- diagnostics broadcast.

Live visitor state:

- `VisitorSession`;
- status:
  - `ONLINE`;
  - `IDLE`;
  - `OFFLINE`;
- controlMode:
  - `AI`;
  - `OPERATOR`;
  - `HYBRID`;
  - `RTC_ACTIVE`.

Operator session locks:

- `OperatorSessionLock`;
- workspaceId;
- conversationId;
- operatorId;
- lockedAt;
- prevents conflicting operator ownership.

## 18. WebRTC / RTC

RTC enables voice/video calls between widget visitor and operator.

Prisma:

- `CallSession`;
- status:
  - `IDLE`;
  - `INVITED`;
  - `ACTIVE`;
  - `ENDED`;
- type:
  - `VOICE`;
  - `VIDEO`;

RTC services:

- `WebRtcSignalService`;
- `ActiveCallRegistryService`;
- `RtcSignalRelayService`;
- `RtcRedisStoreService`;
- `RtcCallRecoveryService`;
- `RtcDiagnosticsBroadcastService`.

TURN credentials:

- issued via `webrtc:turn-credentials`;
- based on `TURN_AUTH_SECRET`;
- host from `TURN_HOST`, default `turn.neeklo.ru`;
- ICE servers include STUN, TURN UDP/TCP, TURNS TCP;
- credentials use HMAC SHA1;
- username includes expiry and random suffix.

RTC frontend runtime:

- package `packages/rtc-runtime`;
- state machine;
- duplicate-offer handling;
- network quality classification;
- diagnostics snapshots;
- labels:
  - excellent;
  - good;
  - connecting;
  - unstable;
  - poor;
  - disconnected.

Operator RTC client:

- `apps/operator-panel/src/lib/operator-rtc-session.ts`;
- starts outgoing call;
- handles incoming offer;
- handles remote signals;
- joins call as operator;
- manages local/remote streams;
- stores recovery.

Widget RTC client:

- `apps/widget/src/lib/widget-rtc-session.ts`;
- accepts invite with media stream;
- handles offer/answer/ICE;
- emits call end;
- manages recovery.

Diagnostics:

- API:
  - `GET /realtime/diagnostics`;
  - `GET /realtime/diagnostics/rtc`;
  - `GET /realtime/diagnostics/calls`;
- frontend:
  - `/admin/rtc-diagnostics`;
- admin socket subscribes with `admin:rtc-subscribe`;
- receives `admin:rtc-diagnostics`.

## 19. Conversations and messages

Conversation model:

- workspaceId;
- assistantId;
- widgetId;
- visitorId;
- status;
- lastMessageAt;
- metadata;
- messages.

Message model:

- workspaceId;
- conversationId;
- role:
  - `USER`;
  - `ASSISTANT`;
  - `SYSTEM`;
  - `TOOL`;
- content;
- citations;
- providerMessageId;
- tokenUsage;
- latencyMs;

Widget conversation flow:

- visitor opens widget;
- widget socket init creates or restores visitor/conversation;
- user message is persisted;
- assistant runtime responds via streaming;
- chunks are emitted to widget;
- done stores final assistant message;
- operator takeover can insert operator messages;
- lead/tool events can attach to conversation.

## 20. AI runtime logic

High-level runtime:

- Assistant resolves active runtime snapshot;
- snapshot contains assistant config, agent config, active prompt, integration, KB/tool bindings;
- user message is converted into runtime messages;
- context is trimmed by `maxContextMessages`;
- RAG retrieval runs if KB connected;
- tools run if enabled and selected;
- model provider is selected from agent integration/model;
- fallback chain can try alternate model(s);
- stream chunks are emitted to socket;
- final message persists usage/citations.

Runtime settings:

- `maxContextMessages`;
- `memoryEnabled`;
- `streamingEnabled`;
- `citationsEnabled`;
- `moderationEnabled`;
- `fallbackMessage`;
- `typingSimulation`.

Agent runtime settings:

- integrationId;
- modelId;
- systemPrompt/promptVersion;
- temperature;
- topP;
- maxTokens;
- streamingEnabled;
- toolsEnabled;
- fallback models.

## 21. Worker

`apps/worker/src/main.ts`:

- loads `.env`;
- connects Redis;
- creates health queue `botme.health`;
- health worker runs `SELECT 1`;
- connects Prisma;
- starts model sync worker;
- starts KB workers;
- schedules health ping every 60 seconds.

Worker jobs:

- integration model sync;
- KB ingestion;
- KB crawl;
- health.

Queues use BullMQ + Redis.

## 22. Database model overview

Prisma datasource:

- PostgreSQL;
- `pgvector` extension.

Auth/workspace:

- `User`;
- `Workspace`;
- `WorkspaceInvite`;
- `WorkspaceMember`;
- `RefreshToken`.

AI:

- `AiIntegration`;
- `AiModelCache`;
- `IntegrationModelChainItem`;
- `Agent`;
- `AgentModelFallback`;
- `AgentPromptVersion`;

Assistant:

- `Assistant`;
- `AssistantRuntimeSettings`;
- `AssistantKnowledgeBase`;
- `AssistantTool`;
- `AssistantRuntimeSnapshot`.

Knowledge:

- `KnowledgeBase`;
- `KbDocument`;
- `KbChunk`.

Tools/leads/memory:

- `Tool`;
- `ToolExecution`;
- `Lead`;
- `VisitorMemory`;
- `CrmNote`.

Widgets/realtime:

- `WidgetInstance`;
- `WidgetDomain`;
- `OperatorRuntimeToken`;
- `VisitorSession`;
- `CallSession`;
- `OperatorSessionLock`.

Conversations:

- `Conversation`;
- `Message`.

Audit/playground:

- `AuditLog`;
- `PlaygroundSession`;
- `PlaygroundMessage`.

Tenant isolation:

- almost every business table includes `workspaceId`;
- repositories and guards scope access by workspace;
- widget public access is separately authenticated by public key + allowed domains;
- operator runtime tokens are scoped to workspace/widget and can be revoked.

## 23. Admin web app

`apps/web` uses:

- React;
- Vite;
- React Router;
- TanStack Query;
- Zustand auth store;
- Socket.IO client;
- shared DTOs from `@botme/shared`;
- UI components from `@botme/ui`.

Routing:

- `/` redirects to `/admin`;
- `/login`;
- `/register`;
- authenticated `/admin/*`;
- unknown routes redirect to `/admin`.

`AuthBootstrapGate`:

- initializes auth session;
- protects routes.

`GuestOnly`:

- only guests can access login/register.

`RequireAuth`:

- requires active session.

`AdminLayout`:

- sidebar navigation;
- mobile sidebar;
- workspace name;
- user email;
- realtime connected/disconnected indicator;
- logout;
- feature flags from `FEATURES`;
- routes:
  - Overview;
  - Agents;
  - Assistants;
  - Tools;
  - Knowledge;
  - AI integrations;
  - Leads;
  - Widgets;
  - Operator;
  - RTC;
  - Settings.

## 24. Pages

### `/login`

Файл: `apps/web/src/pages/auth-pages.tsx`.

Функции:

- ввод email/password;
- login via `/auth/login`;
- сохраняет session в auth store;
- redirect в admin.

### `/register`

Файл: `apps/web/src/pages/auth-pages.tsx`.

Функции:

- регистрация пользователя;
- создание workspace;
- login после регистрации.

### `/admin`

Файл: `apps/web/src/pages/dashboard-page.tsx`.

Функции:

- показывает workspace summary;
- member count;
- agents count;
- conversations count;
- leads count;
- переключение workspace, если доступно несколько.

### `/admin/agents`

Файл: `apps/web/src/pages/agents-page.tsx`.

Функции:

- список agents;
- создание;
- редактирование basic settings;
- archive;
- open editor;
- open playground;
- provider/model picker;
- fallback chain.

### `/admin/agents/:id`

Файл: `apps/web/src/pages/agent-editor-page.tsx`.

Функции:

- prompt versions;
- diff versions;
- activate version;
- runtime settings;
- model selector;
- fallback chain;
- diagnostics.

### `/admin/agents/:id/playground`

Файл: `apps/web/src/pages/agent-playground-page.tsx`.

Функции:

- тестирование агента;
- session;
- cancel;
- вывод сообщений.

### `/admin/assistants`

Файл: `apps/web/src/pages/assistants-page.tsx`.

Функции:

- список ассистентов;
- создание ассистента;
- переход в detail;
- переход в test chat.

### `/admin/assistants/:id`

Файл: `apps/web/src/pages/assistant-detail-page.tsx`.

Функции:

- General;
- Runtime;
- Knowledge binding;
- Tools binding;
- Widget design;
- RTC policy.

### `/admin/assistants/:id/runtime`

Файл: `apps/web/src/pages/assistant-runtime-page.tsx`.

Функции:

- показывает runtime snapshot ассистента.

### `/admin/assistants/:id/chat`

Файл: `apps/web/src/pages/assistant-chat-page.tsx`.

Функции:

- test chat;
- streaming via admin socket;
- citations;
- usage;
- cancel;
- clear.

### `/admin/tools`

Файл: `apps/web/src/pages/tools-page.tsx`.

Функции:

- tool cards;
- status;
- execution count;
- average latency;
- переход к detail.

### `/admin/tools/:id`

Файл: `apps/web/src/pages/tool-detail-page.tsx`.

Функции:

- detail tool;
- enable/config update;
- test tool.

### `/admin/knowledge`

Файл: `apps/web/src/pages/knowledge-page.tsx`.

Функции:

- KB list;
- create/delete KB;
- documents;
- upload;
- URL import;
- text editor;
- preview chunks;
- chunks browser;
- retrieval test;
- retry/delete docs.

### `/admin/integrations`

Файл: `apps/web/src/pages/integrations-page.tsx`.

Функции:

- provider cards;
- create integration;
- validate;
- sync models;
- delete;
- model list/search;
- model chain editor.

### `/admin/leads`

Файл: `apps/web/src/pages/leads-page.tsx`.

Функции:

- список лидов;
- status filter;
- search;
- status update;
- CSV export.

### `/admin/widgets`

Файл: `apps/web/src/pages/widgets-page.tsx`.

Функции:

- Connection Center;
- create widget;
- select widget;
- install guide;
- embed code;
- design editor;
- allowed domains;
- operator connection;
- operator tokens;
- RTC guide;
- diagnostics;
- self-host snippets;
- preview iframe.

### `/admin/operator`

Файл: `apps/web/src/pages/operator-page.tsx`.

Функции:

- iframe operator panel `/operator-panel/`;
- permission policy for microphone/camera/autoplay/fullscreen/display-capture.

### `/admin/rtc-diagnostics`

Файл: `apps/web/src/pages/rtc-diagnostics-page.tsx`.

Функции:

- active calls;
- TURN enabled/host;
- widget sockets;
- operator sockets;
- active calls table;
- realtime push via admin socket.

### `/admin/settings`

Файл: `apps/web/src/pages/feature-empty-page.tsx`.

Функции:

- placeholder/empty feature page.

## 25. Public/self-host surfaces

Widget:

- `<script src="https://agent.neeklo.ru/widget.js" data-widget-key="..."></script>`;
- loader fetches init;
- iframe loads `/widget/`.

Operator:

- admin operator URL;
- `operator.js`;
- operator runtime URL;
- operator runtime tokens;
- self-host package zip.

Connection Center exposes:

- embed code;
- widget.js URL;
- operator.js URL;
- operator-runtime package path;
- websocket endpoint;
- RTC signaling path;
- permissions policy;
- nginx snippets;
- CSP example.

## 26. Security and boundaries

Auth:

- JWT guard;
- refresh tokens;
- httpOnly cookie flow;
- RBAC roles.

Workspace isolation:

- `WorkspaceGuard`;
- workspace-scoped repositories;
- `workspaceId` on business records.

Public widget security:

- publicKey;
- domain allowlist via `WidgetDomain`;
- widget auth service;
- preview token for admin preview.

Operator security:

- authenticated admin operator iframe;
- public operator runtime token flow;
- token hash/encryption;
- allowed domains;
- revoke support.

Secrets:

- integration secrets encrypted;
- provider credentials resolved through config/security services;
- S3 credentials and TURN secret from env.

Validation:

- backend uses Zod schemas from `@botme/shared`;
- Nest ValidationPipe;
- upload limits for KB files and launcher icons.

## 27. Storage

S3-compatible storage:

- configured by `S3_ENDPOINT`;
- public endpoint `S3_PUBLIC_ENDPOINT`;
- bucket `S3_BUCKET`;
- used for KB files;
- used for widget launcher icon upload;
- supports presigned upload URL;
- supports direct `putObject`, `getObjectBuffer`, `deleteObject`.

Storage URL pattern:

- `S3_PUBLIC_ENDPOINT/bucket/storageKey`.

## 28. Health and diagnostics

Health API:

- `GET /health`;
- checks API/Postgres/Redis.

Widget Connection Center:

- server checks;
- browser diagnostics;
- widget socket count;
- operator socket count;
- overall health chip.

RTC diagnostics:

- REST;
- admin socket push;
- active call snapshots.

Worker health:

- BullMQ health queue;
- periodic `SELECT 1`.

## 29. Recent implemented widget design system

Widget design now includes:

- `designPreset`;
- `launcherIconUrl`;
- `assetVersion`;
- 10 presets;
- SVG/PNG launcher icon upload;
- cache-busted iframe;
- no-store init;
- no-store `widget.js`;
- glassmorphism runtime style;
- input text variables:
  - `--botme-input-text`;
  - `--botme-placeholder`;
  - `--botme-muted-text`.

Current neeklo public widget configuration was switched to:

- `designPreset: glass`;
- `darkMode: false`;
- `iframeWidth: 760`;
- `iframeHeight: 420`;
- light glass background;
- blue/violet user bubbles;
- translucent assistant bubbles;
- AI blue dot indicator.

## 30. Known operational scripts

Deploy:

- `infra/scripts/deploy-production.sh`.

Health:

- `infra/scripts/health-verify-production.sh`.

Safety:

- `infra/scripts/backup-db.sh`;
- `infra/scripts/deploy-preflight.sh`;
- `infra/scripts/snapshot-release.sh`;
- `infra/scripts/rollback-production.sh`;
- `infra/scripts/require-clean-git.sh`;
- `infra/scripts/audit-production-integrity.mjs`;
- `infra/scripts/repair-runtime-bindings.mjs`.

Seeds/tests:

- `infra/scripts/seed-dental-demo.mjs`;
- `infra/scripts/test-turn.mjs`;
- `infra/scripts/reset-stale-rtc.mjs`.

## 31. End-to-end data flows

### Создание AI-ассистента

1. Admin создаёт integration.
2. Admin синхронизирует модели.
3. Admin создаёт agent с provider/model/systemPrompt.
4. Admin создаёт assistant.
5. Assistant привязывается к agent.
6. Assistant получает runtime settings.
7. KB/tools привязываются к assistant.
8. Runtime snapshot собирается для исполнения.

### Публичный чат через виджет

1. Сайт загружает `widget.js`.
2. Loader получает `/api/public/widget/:key/init`.
3. Loader создаёт launcher и iframe.
4. Iframe подключается к widget socket.
5. Widget socket вызывает `widget:init`.
6. Backend создаёт/восстанавливает visitor session и conversation.
7. Пользователь отправляет сообщение.
8. Backend запускает assistant runtime.
9. Runtime извлекает context/KB/tools.
10. AI stream отправляется chunks в widget.
11. Финальное сообщение сохраняется в `Message`.
12. Если есть Lead Saver или lead extraction, создаётся `Lead`.

### Операторский takeover

1. Operator panel подключается к operator socket.
2. Backend отдаёт live visitors.
3. Оператор выбирает visitor.
4. Оператор делает takeover.
5. `VisitorSession.controlMode` переходит в operator/hybrid state.
6. Оператор получает conversation history.
7. Operator messages сохраняются и транслируются visitor widget.
8. Release возвращает управление AI/operator policy.

### Видеозвонок

1. Operator нажимает voice/video call.
2. Backend создаёт `CallSession`.
3. Widget получает invite.
4. Visitor принимает и даёт camera/microphone permissions.
5. Operator и visitor получают TURN credentials.
6. WebRTC offer/answer/ICE relay идёт через realtime gateway.
7. `CallSession` становится active.
8. Diagnostics обновляются через RTC broadcast.
9. При завершении обе стороны получают `webrtc:call-end`.
10. `VisitorSession.controlMode` сбрасывается из `RTC_ACTIVE`.

### KB ingestion

1. Admin создаёт KB.
2. Admin загружает файл, создаёт текст или URL.
3. API создаёт `KbDocument`.
4. Worker парсит документ.
5. Worker chunking.
6. Worker считает embeddings.
7. Chunks сохраняются с vector embedding.
8. Retrieval test и assistant runtime используют chunks.

## 32. Что важно не ломать

Критичные контуры проекта:

- workspace isolation;
- auth/refresh/httpOnly cookies;
- assistant runtime snapshots;
- AI integration secrets;
- RAG chunking/retrieval/citations;
- widget public auth + allowed domains;
- realtime sockets;
- operator takeover;
- RTC signaling/TURN;
- deploy pipeline и nginx только для `agent.neeklo.ru`.

## 33. Быстрые команды разработки

Основные:

```bash
pnpm install
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Production deploy:

```bash
./infra/scripts/deploy-production.sh
```

После production deploy проверяются:

- `/health`;
- widget.js;
- `/widget/`;
- websocket;
- pm2 status;
- nginx config.

## 34. Файлы входа

Backend:

- `apps/api/src/main.ts`;
- `apps/api/src/app.module.ts`.

Web:

- `apps/web/src/app-routes.tsx`;
- `apps/web/src/components/layout/admin-layout.tsx`.

Widget:

- `apps/widget/loader/loader.ts`;
- `apps/widget/src/app.tsx`;
- `apps/widget/src/widget.css`.

Operator:

- `apps/operator-panel/src/components/operator-platform.tsx`.

Worker:

- `apps/worker/src/main.ts`.

Database:

- `packages/database/prisma/schema.prisma`.

Shared contracts:

- `packages/shared/src/index.ts`;
- `packages/shared/src/auth.ts`;
- `packages/shared/src/agents.ts`;
- `packages/shared/src/assistants.ts`;
- `packages/shared/src/integrations.ts`;
- `packages/shared/src/knowledge.ts`;
- `packages/shared/src/tools.ts`;
- `packages/shared/src/widgets-admin.ts`;
- `packages/shared/src/widget.ts`;
- `packages/shared/src/widget-theme.ts`;
- `packages/shared/src/operator.ts`;
- `packages/shared/src/connection-center.ts`;
- `packages/shared/src/leads.ts`;
- `packages/shared/src/workspace-members.ts`.

Infra:

- `ecosystem.config.cjs`;
- `infra/production/nginx/agent.neeklo.ru.conf`;
- `infra/scripts/deploy-production.sh`.

