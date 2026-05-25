import { z } from 'zod';

export const ToolTypeSchema = z.enum([
  'CALCULATOR',
  'HTTP_REQUEST',
  'LEAD_SAVER',
  'RAG_SEARCH',
  'MEMORY',
  'WEBHOOK',
  'WEB_SEARCH',
  'EMAIL_STUB',
  'CRM_NOTE',
  'CUSTOM',
]);

export const ToolRetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(5).default(0),
  backoffMs: z.number().int().min(0).max(60_000).default(0),
});

export const UpdateToolSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().min(1000).max(120_000).optional(),
  retryPolicy: ToolRetryPolicySchema.optional(),
  permissions: z.array(z.string()).optional(),
});

export const TestToolSchema = z.object({
  input: z.record(z.unknown()).default({}),
  assistantId: z.string().cuid().optional(),
  conversationId: z.string().cuid().optional(),
});

export interface ToolCatalogEntry {
  type: z.infer<typeof ToolTypeSchema>;
  slug: string;
  name: string;
  category: string;
  description: string;
  schema: Record<string, unknown>;
  permissions: string[];
  timeoutMs: number;
  retryPolicy: z.infer<typeof ToolRetryPolicySchema>;
}

export const BUILTIN_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    type: 'CALCULATOR',
    slug: 'calculator',
    name: 'Калькулятор',
    category: 'utility',
    description: 'Вычисляет математические выражения',
    schema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Math expression' } },
      required: ['expression'],
    },
    permissions: ['compute'],
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 0, backoffMs: 0 },
  },
  {
    type: 'RAG_SEARCH',
    slug: 'rag-search',
    name: 'Поиск по базе знаний',
    category: 'knowledge',
    description: 'Семантический поиск по привязанным базам знаний',
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
    permissions: ['read:kb'],
    timeoutMs: 30_000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
  },
  {
    type: 'HTTP_REQUEST',
    slug: 'http-request',
    name: 'HTTP запрос',
    category: 'integration',
    description: 'Безопасный HTTP GET/POST к внешним API',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', enum: ['GET', 'POST'] },
        body: { type: 'object' },
      },
      required: ['url'],
    },
    permissions: ['http:external'],
    timeoutMs: 10_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000 },
  },
  {
    type: 'LEAD_SAVER',
    slug: 'lead-saver',
    name: 'Сохранение лида',
    category: 'crm',
    description: 'Сохраняет контактные данные посетителя',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        notes: { type: 'string' },
      },
    },
    permissions: ['write:leads'],
    timeoutMs: 10_000,
    retryPolicy: { maxRetries: 2, backoffMs: 500 },
  },
  {
    type: 'MEMORY',
    slug: 'memory',
    name: 'Память посетителя',
    category: 'utility',
    description: 'Сохраняет и читает ключ-значение для посетителя',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'delete'] },
        key: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['action', 'key'],
    },
    permissions: ['read:memory', 'write:memory'],
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 0, backoffMs: 0 },
  },
  {
    type: 'WEBHOOK',
    slug: 'webhook',
    name: 'Webhook',
    category: 'integration',
    description: 'Отправляет подписанный webhook на внешний URL',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        payload: { type: 'object' },
        secret: { type: 'string' },
      },
      required: ['url', 'payload'],
    },
    permissions: ['webhook:send'],
    timeoutMs: 15_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000 },
  },
  {
    type: 'WEB_SEARCH',
    slug: 'web-search',
    name: 'Веб-поиск',
    category: 'knowledge',
    description: 'Поиск информации в интернете',
    schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    permissions: ['search:web'],
    timeoutMs: 15_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000 },
  },
  {
    type: 'EMAIL_STUB',
    slug: 'email-stub',
    name: 'Email (stub)',
    category: 'communication',
    description: 'Формирует email-сообщение (без реальной отправки)',
    schema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
    permissions: ['email:compose'],
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 0, backoffMs: 0 },
  },
  {
    type: 'CRM_NOTE',
    slug: 'crm-note',
    name: 'CRM заметка',
    category: 'crm',
    description: 'Сохраняет заметку по диалогу',
    schema: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
    permissions: ['write:crm'],
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
  },
];

export interface ToolDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  type: string;
  status: string;
  enabled: boolean;
  schema: Record<string, unknown>;
  permissions: string[];
  timeoutMs: number;
  retryPolicy: { maxRetries: number; backoffMs: number };
  executionCount: number;
  avgLatencyMs: number | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolDetailDto extends ToolDto {
  recentExecutions: ToolExecutionDto[];
  boundAssistantIds: string[];
}

export interface ToolExecutionDto {
  id: string;
  toolId: string;
  toolName: string;
  assistantId: string | null;
  conversationId: string | null;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  latencyMs: number | null;
  retryCount: number;
  createdAt: string;
}

export interface TestToolResultDto {
  ok: boolean;
  output: string;
  data?: Record<string, unknown>;
  error?: string;
  latencyMs: number;
  executionId: string;
}
