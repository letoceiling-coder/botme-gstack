#!/usr/bin/env node
/**
 * Idempotent seed for Dental Demo workspace (M11.4).
 * Run on production: cd apps/api && node ../../infra/scripts/seed-dental-demo.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const requireFromApi = createRequire(resolve(ROOT, 'apps/api/package.json'));
const bcrypt = requireFromApi('bcrypt');
const { Queue } = requireFromApi('bullmq');
const IORedis = requireFromApi('ioredis');
const requireDist = createRequire(import.meta.url);
const { prisma } = requireDist(resolve(ROOT, 'packages/database/dist/index.js'));

function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const OWNER_EMAIL = 'dsc-23@yandex.ru';
const WORKSPACE_SLUG = 'dental-demo';
const WORKSPACE_NAME = 'Dental Demo';
const DEMO_CONFIG_PATH = process.env['DEMO_CONFIG_PATH'] ?? '/var/www/demo.neeklo.ru/demo-config.json';

const DENTAL_LAUNCHER = {
  primaryColor: '#0d9488',
  secondaryColor: '#134e4a',
  textColor: '#fafafa',
  launcherPosition: 'bottom-right',
  borderRadius: 20,
  launcherIcon: '🦷',
  welcomeMessage: 'Здравствуйте! Я AI-ассистент Neeklo Dental. Помогу с услугами, ценами и записью.',
  widgetTitle: 'Neeklo Dental',
  typingColor: '#5eead4',
  bubbleUserColor: 'rgba(13, 148, 136, 0.2)',
  bubbleAssistantColor: 'rgba(255, 255, 255, 0.06)',
  fullscreenMobile: true,
  darkMode: false,
  compactMode: false,
  iframeWidth: 400,
  iframeHeight: 560,
  animations: true,
  quickActions: ['Цены', 'Консультация', 'Имплантация', 'Виниры', 'Запись', 'Связаться с врачом'],
};

const SYSTEM_PROMPT = `Вы — премиальный AI-ассистент стоматологической клиники Neeklo Dental (Москва).

Роль:
- Консультации по услугам: имплантация, виниры, ортодонтия, отбеливание, детская стоматология, хирургия
- Ответы на FAQ, объяснение процедур простым языком
- Ориентировочные цены (уточняйте, что точная стоимость после осмотра)
- Запись на бесплатную консультацию и сбор контактов (имя, телефон)
- Эскалация к живому оператору при сложных медицинских вопросах или запросе человека

Правила:
- Используйте базу знаний — не выдумывайте цены и гарантии
- Будьте тёплыми, профессиональными, краткими
- Не ставьте диагнозы — рекомендуйте очный осмотр
- При запросе звонка/оператора — предложите оставить контакты или дождаться оператора`;

const KB_DOCS = [
  {
    title: 'Имплантация',
    category: 'implantation',
    content: `# Имплантация зубов — Neeklo Dental

## Протоколы
- Классическая двухэтапная имплантация
- Одномоментная имплантация с немедленной нагрузкой (по показаниям)
- All-on-4 / All-on-6 для полной адентии
- Синус-лифтинг и костная пластика при дефиците кости

## Бренды имплантов
- Straumann, Nobel Biocare, Osstem — подбор по КТ и бюджету

## Сроки
- Установка импланта: 40–90 минут
- Остеоинтеграция: 3–6 месяцев (индивидуально)
- Коронка на имплант: через 2–4 визита после приживления

## Цены (ориентир)
- Имплант + абатмент + коронка «под ключ»: от 89 000 ₽
- All-on-4 на челюсть: от 490 000 ₽
- Синус-лифтинг: от 35 000 ₽

## Гарантии
- На имплант: до 10 лет при соблюдении профилактики
- На работу клиники: до 5 лет`,
  },
  {
    title: 'Виниры и эстетика',
    category: 'veneers',
    content: `# Виниры и эстетическая стоматология

## Виды виниров
- Керамические E.max — тонкие, естественная прозрачность
- Цифровой дизайн улыбки (DSD) перед препарированием

## Этапы
1. Консультация + фото/скан
2. Mock-up — примерка будущей улыбки
3. Препарирование и временные виниры
4. Фиксация постоянных E.max

## Цены
- Винир E.max: от 45 000 ₽ за зуб
- Комплекс «Голливудская улыбка» (10 зубов): от 420 000 ₽`,
  },
  {
    title: 'Ортодонтия',
    category: 'orthodontics',
    content: `# Ортодонтия — элайнеры и брекеты

## Элайнеры
- Прозрачные капы, смена каждые 7–14 дней
- Срок: 6–18 месяцев
- Цена: от 190 000 ₽

## Брекеты
- Металлические, керамические, сапфировые
- Срок: 12–24 месяца
- Цена: от 120 000 ₽`,
  },
  {
    title: 'Отбеливание',
    category: 'whitening',
    content: `# Профессиональное отбеливание

## Zoom / лазерное отбеливание
- Результат до 8 тонов за 1 визит (индивидуально)
- Длительность: 60–90 минут
- Цена: от 18 000 ₽

## Домашнее отбеливание
- Индивидуальные капы + гель: от 12 000 ₽`,
  },
  {
    title: 'Детская стоматология',
    category: 'pediatric',
    content: `# Детская стоматология

## Подход
- Адаптационный первый визит без лечения
- Седация закисью азота по показаниям
- Профилактика: герметизация фissur, фторирование

## Цены
- Осмотр: бесплатно при записи через сайт
- Лечение кариеса молочного зуба: от 4 500 ₽`,
  },
  {
    title: 'Хирургия',
    category: 'surgery',
    content: `# Хирургическая стоматология

## Услуги
- Удаление простое и сложное (ретинированные)
- Резекция верхушки корня
- Пластика уздечки, костная пластика

## Цены
- Удаление зуба: от 3 500 ₽
- Сложное удаление «мудрости»: от 8 900 ₽`,
  },
  {
    title: 'FAQ',
    category: 'faq',
    content: `# Частые вопросы

**Больно ли?** Современная анестезия и седация — дискомфорт минимален.

**Рассрочка?** 0% на 12 месяцев через партнёрские банки.

**Гарантия?** До 10 лет на импланты, до 5 лет на работу при профилактике.

**Как записаться?** Оставьте имя и телефон — администратор перезвонит в течение 15 минут.`,
  },
  {
    title: 'Прайс и акции',
    category: 'pricing',
    content: `# Цены и акции Neeklo Dental

| Услуга | Цена от |
|--------|---------|
| Консультация + КТ | 0 ₽ |
| Профгигиена | 8 900 ₽ |
| Имплант под ключ | 89 000 ₽ |
| Винир E.max | 45 000 ₽ |
| Элайнеры | 190 000 ₽ |
| Отбеливание Zoom | 18 000 ₽ |

Акция: бесплатная консультация и КТ при записи через виджет на сайте.`,
  },
  {
    title: 'Гарантии и реабilitation',
    category: 'guarantees',
    content: `# Гарантии и реабilitation

## Гарантийные обязательства
- Импланты: 10 лет (производитель + клиника)
- Ортопедия на имплантах: 5 лет
- Виниры: 3 года при отсутствии травм

## Реабilitation после имплантации
- День 1–3: мягкая пища, без курения
- Контроль через 7–14 дней
- Профгигиена каждые 6 месяцев`,
  },
];

async function enqueueParse(documentId, workspaceId, kbId) {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('kb.parse', { connection });
  await prisma.kbDocument.update({ where: { id: documentId }, data: { status: 'PARSING' } });
  await queue.add('parse', { documentId, workspaceId, knowledgeBaseId: kbId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
  await queue.close();
  await connection.quit();
}

async function main() {
  console.log('==> Dental Demo seed');

  let user = await prisma.user.findFirst({ where: { email: OWNER_EMAIL.toLowerCase(), deletedAt: null } });
  if (!user) {
    const password = process.env['DEMO_OPERATOR_PASSWORD'] ?? `Demo${randomBytes(4).toString('hex')}!`;
    const passwordHash = await bcrypt.hash(password, 12);
    user = await prisma.user.create({
      data: { email: OWNER_EMAIL.toLowerCase(), passwordHash, name: 'Dental Demo Owner' },
    });
    console.log(`Created user ${OWNER_EMAIL} password=${password}`);
  } else {
    console.log(`User exists: ${OWNER_EMAIL}`);
  }

  let workspace = await prisma.workspace.findFirst({ where: { slug: WORKSPACE_SLUG, deletedAt: null } });
  if (!workspace) {
    workspace = await prisma.workspace.create({ data: { name: WORKSPACE_NAME, slug: WORKSPACE_SLUG } });
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
    });
    console.log(`Created workspace ${WORKSPACE_NAME}`);
  } else {
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, userId: user.id },
    });
    if (!member) {
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
      });
    }
    console.log(`Workspace exists: ${workspace.name}`);
  }

  let integration = await prisma.aiIntegration.findFirst({
    where: { workspaceId: workspace.id, status: 'ACTIVE', deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!integration) {
    throw new Error(
      `No ACTIVE AI integration in workspace ${workspace.slug} — add OpenRouter integration in admin first`,
    );
  }
  console.log(`Using workspace-local integration: ${integration.name} (${integration.id})`);

  let agent = await prisma.agent.findFirst({
    where: { workspaceId: workspace.id, name: 'Dental AI Agent', deletedAt: null },
  });
  if (!agent) {
    agent = await prisma.$transaction(async (tx) => {
      const created = await tx.agent.create({
        data: {
          workspaceId: workspace.id,
          integrationId: integration.id,
          modelId: 'openai/gpt-4o-mini',
          name: 'Dental AI Agent',
          description: 'Premium dental clinic assistant',
          systemPrompt: SYSTEM_PROMPT,
          status: 'ACTIVE',
          toolsEnabled: true,
        },
      });
      const version = await tx.agentPromptVersion.create({
        data: { agentId: created.id, version: 1, content: SYSTEM_PROMPT, createdBy: user.id },
      });
      return tx.agent.update({
        where: { id: created.id },
        data: { activePromptVersionId: version.id },
      });
    });
    console.log('Created agent');
  } else if (agent.integrationId !== integration.id) {
    const bound = await prisma.aiIntegration.findUnique({ where: { id: agent.integrationId } });
    if (!bound || bound.workspaceId !== workspace.id) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { integrationId: integration.id },
      });
      console.log(`Rebound agent to workspace-local integration ${integration.name}`);
    }
  }

  let kb = await prisma.knowledgeBase.findFirst({
    where: { workspaceId: workspace.id, name: 'Dental Knowledge Base', deletedAt: null },
  });
  if (!kb) {
    kb = await prisma.knowledgeBase.create({
      data: {
        workspaceId: workspace.id,
        name: 'Dental Knowledge Base',
        description: 'Neeklo Dental services, pricing, FAQ',
        chunkSize: 700,
        chunkOverlap: 120,
        retrievalTopK: 8,
        similarityThreshold: 0.72,
        citationMode: 'INLINE',
        chunkStrategy: 'smart',
        hybridRetrievalEnabled: true,
        embeddingIntegrationId: integration.id,
      },
    });
    console.log('Created knowledge base');
  }

  for (const doc of KB_DOCS) {
    const fileHash = createHash('sha256').update(doc.content).digest('hex');
    const existing = await prisma.kbDocument.findFirst({
      where: { knowledgeBaseId: kb.id, fileHash, deletedAt: null },
    });
    if (existing) continue;

    const created = await prisma.kbDocument.create({
      data: {
        workspaceId: workspace.id,
        knowledgeBaseId: kb.id,
        sourceType: 'TEXT',
        title: doc.title,
        filename: `${doc.title}.md`,
        mimeType: 'text/markdown',
        sizeBytes: Buffer.byteLength(doc.content, 'utf8'),
        fileHash,
        rawContent: doc.content,
        storageKey: '',
        status: 'QUEUED',
        documentType: 'markdown',
        category: doc.category,
        language: 'ru',
      },
    });
    await enqueueParse(created.id, workspace.id, kb.id);
    console.log(`Enqueued KB doc: ${doc.title}`);
  }

  for (const toolDef of [
    { name: 'RAG Search', slug: 'rag-search', type: 'RAG_SEARCH' },
    { name: 'Lead Saver', slug: 'lead-saver', type: 'LEAD_SAVER' },
  ]) {
    const exists = await prisma.tool.findFirst({
      where: { workspaceId: workspace.id, slug: toolDef.slug, deletedAt: null },
    });
    if (!exists) {
      await prisma.tool.create({
        data: {
          workspaceId: workspace.id,
          name: toolDef.name,
          slug: toolDef.slug,
          type: toolDef.type,
          status: 'ACTIVE',
          enabled: true,
        },
      });
    }
  }

  let assistant = await prisma.assistant.findFirst({
    where: { workspaceId: workspace.id, slug: 'dental-assistant', deletedAt: null },
  });
  if (!assistant) {
    assistant = await prisma.assistant.create({
      data: {
        workspaceId: workspace.id,
        agentId: agent.id,
        name: 'Neeklo Dental Assistant',
        slug: 'dental-assistant',
        description: 'Premium dental clinic AI assistant',
        welcomeMessage: DENTAL_LAUNCHER.welcomeMessage,
        placeholder: 'Спросите об услугах, ценах или записи…',
        tone: 'friendly',
        language: 'ru',
        isActive: true,
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        createdBy: user.id,
      },
    });
    await prisma.assistantRuntimeSettings.create({
      data: {
        assistantId: assistant.id,
        maxContextMessages: 24,
        memoryEnabled: true,
        citationsEnabled: true,
        streamingEnabled: true,
        fallbackMessage: 'Извините, сейчас не могу ответить. Оставьте телефон — оператор свяжется с вами.',
      },
    });
    console.log('Created assistant');
  }

  const ragTool = await prisma.tool.findFirst({ where: { workspaceId: workspace.id, slug: 'rag-search' } });
  const leadTool = await prisma.tool.findFirst({ where: { workspaceId: workspace.id, slug: 'lead-saver' } });
  for (const toolId of [ragTool?.id, leadTool?.id]) {
    if (!toolId) continue;
    const bound = await prisma.assistantTool.findFirst({ where: { assistantId: assistant.id, toolId } });
    if (!bound) await prisma.assistantTool.create({ data: { assistantId: assistant.id, toolId } });
  }
  const kbBound = await prisma.assistantKnowledgeBase.findFirst({
    where: { assistantId: assistant.id, knowledgeBaseId: kb.id },
  });
  if (!kbBound) {
    await prisma.assistantKnowledgeBase.create({ data: { assistantId: assistant.id, knowledgeBaseId: kb.id } });
  }

  let widget = await prisma.widgetInstance.findFirst({
    where: { workspaceId: workspace.id, name: 'Neeklo Dental Widget', deletedAt: null },
  });
  if (!widget) {
    widget = await prisma.widgetInstance.create({
      data: {
        workspaceId: workspace.id,
        assistantId: assistant.id,
        publicKey: `wm_dental_${randomBytes(12).toString('hex')}`,
        name: 'Neeklo Dental Widget',
        launcherConfig: DENTAL_LAUNCHER,
        isActive: true,
        domains: {
          create: [
            { domain: 'demo.neeklo.ru' },
            { domain: 'agent.neeklo.ru' },
            { domain: 'localhost' },
          ],
        },
      },
    });
    console.log(`Created widget ${widget.publicKey}`);
  } else {
    await prisma.widgetInstance.update({
      where: { id: widget.id },
      data: { launcherConfig: DENTAL_LAUNCHER, isActive: true },
    });
    await prisma.widgetDomain.deleteMany({ where: { widgetId: widget.id } });
    await prisma.widgetDomain.createMany({
      data: ['demo.neeklo.ru', 'agent.neeklo.ru', 'localhost'].map((domain) => ({
        widgetId: widget.id,
        domain,
      })),
    });
  }

  const config = {
    widgetPublicKey: widget.publicKey,
    operatorKey: widget.publicKey,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    updatedAt: new Date().toISOString(),
  };

  try {
    mkdirSync(dirname(DEMO_CONFIG_PATH), { recursive: true });
    writeFileSync(DEMO_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`Wrote ${DEMO_CONFIG_PATH}`);
  } catch (err) {
    console.warn(`Could not write demo-config: ${err.message}`);
    console.log('demo-config.json:', JSON.stringify(config, null, 2));
  }

  console.log('\n=== Dental Demo Ready ===');
  console.log(`Widget key: ${widget.publicKey}`);
  console.log(`Operator key: ${widget.publicKey}`);
  console.log(`Workspace: ${workspace.name} (${workspace.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
