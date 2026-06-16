import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@botme/database';
import { Prisma } from '@botme/database';
import {
  aiProviderFactory,
  chunkMarkdown,
  chunkPlainText,
  embedWithModelFallback,
  enrichChunkMetadata,
  extractDocumentMetadata,
  KB_EMBEDDING_MODEL_TIERS,
  smartChunk,
  smartChunkPdfPages,
  ensureParserRegistry,
  parserRegistry,
  type ChunkerConfig,
  type SmartChunk,
} from '@botme/ai-core';
import { EnvelopeEncryptionService } from '@botme/crypto';
import { registerWorkerParsers } from '../parsers/register-parsers.js';
import { crawlWebsite, discoverCrawlUrls, type CrawlConfig } from './kb-crawl.js';
import { NeekloParserClient } from '../services/neeklo-parser.client.js';
import { parserUrlsResultToCrawlPages } from '../services/neeklo-parser-to-kb.js';

loadEnv({ path: resolve(process.cwd(), '../../.env'), override: true });
registerWorkerParsers();

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

function s3Client(): S3Client {
  return new S3Client({
    region: process.env['S3_REGION'] ?? 'us-east-1',
    endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
    forcePathStyle: process.env['S3_FORCE_PATH_STYLE'] !== 'false',
    credentials: {
      accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'botme',
      secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'botme_secret',
    },
  });
}

const bucket = process.env['S3_BUCKET'] ?? 'botme';

async function findRootOpenRouter(workspaceId: string) {
  const base = { workspaceId, deletedAt: null, provider: 'OPENROUTER' as const };
  const byName = await prisma.aiIntegration.findFirst({
    where: { ...base, name: { equals: 'root', mode: 'insensitive' }, status: 'ACTIVE' },
  });
  if (byName) return byName;

  const byDefault = await prisma.aiIntegration.findFirst({
    where: { ...base, isDefault: true, status: 'ACTIVE' },
  });
  if (byDefault) return byDefault;

  return prisma.aiIntegration.findFirst({
    where: { ...base, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
}

async function downloadBuffer(storageKey: string): Promise<Buffer> {
  const res = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function uploadParsedText(storageKey: string, text: string): Promise<string> {
  const parsedKey = `${storageKey}.parsed.txt`;
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: parsedKey,
      Body: text,
      ContentType: 'text/plain; charset=utf-8',
    }),
  );
  return parsedKey;
}

interface DocJob {
  documentId: string;
  workspaceId: string;
  knowledgeBaseId: string;
  parsedStorageKey?: string;
}

async function markFailed(documentId: string, message: string): Promise<void> {
  await prisma.kbDocument.update({
    where: { id: documentId },
    data: { status: 'FAILED', errorMessage: message.slice(0, 2000) },
  });
}

async function withFailureHandling(documentId: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка обработки';
    await markFailed(documentId, message);
    throw err;
  }
}

async function crawlDocument(data: DocJob): Promise<void> {
  await withFailureHandling(data.documentId, async () => {
    const doc = await prisma.kbDocument.findFirst({
      where: { id: data.documentId, workspaceId: data.workspaceId, deletedAt: null },
    });
    if (!doc || doc.sourceType !== 'URL') throw new Error('Document not found');

    await prisma.kbDocument.update({ where: { id: doc.id }, data: { status: 'PARSING' } });

    const config = (doc.crawlConfig ?? {}) as unknown as CrawlConfig & { startUrl?: string; parserGoal?: string };
    const startUrl = doc.sourceUrl ?? config.startUrl;
    if (!startUrl) throw new Error('URL не указан');

    const parser = NeekloParserClient.fromEnv();
    let pages;
    if (parser) {
      const urls =
        (config.maxDepth ?? 0) > 0 || (config.maxPages ?? 1) > 1
          ? await discoverCrawlUrls(
              {
                startUrl,
                maxDepth: config.maxDepth ?? 0,
                maxPages: config.maxPages ?? 20,
                includePatterns: config.includePatterns,
                excludePatterns: config.excludePatterns,
                respectRobots: config.respectRobots ?? true,
              },
              20,
            )
          : [startUrl];
      const goal =
        config.parserGoal?.trim() ||
        `контент для базы знаний «${doc.title}»: услуги, цены, FAQ, контакты`;
      const parsed = await parser.parseUrls(urls, goal);
      pages = parserUrlsResultToCrawlPages(parsed);
    } else {
      pages = await crawlWebsite({
        startUrl,
        maxDepth: config.maxDepth ?? 0,
        maxPages: config.maxPages ?? 20,
        includePatterns: config.includePatterns,
        excludePatterns: config.excludePatterns,
        respectRobots: config.respectRobots ?? true,
      });
    }

    if (pages.length === 0) throw new Error('Crawl не нашёл контент');

    const combined = pages
      .map((p) => `# ${p.title}\nURL: ${p.url}\n\n${p.text}`)
      .join('\n\n---\n\n');

    const storageKey =
      doc.storageKey ||
      `workspaces/${data.workspaceId}/kb/${data.knowledgeBaseId}/${doc.id}/crawl.txt`;
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: combined,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );

    const parsedKey = await uploadParsedText(storageKey, combined);
    await prisma.kbDocument.update({
      where: { id: doc.id },
      data: {
        storageKey,
        parsedStorageKey: parsedKey,
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(combined, 'utf8'),
        status: 'CHUNKING',
      },
    });

    await chunkQueue.add('chunk', { ...data, parsedStorageKey: parsedKey }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  });
}

async function parseDocument(data: DocJob): Promise<void> {
  await withFailureHandling(data.documentId, async () => {
    const doc = await prisma.kbDocument.findFirst({
      where: { id: data.documentId, workspaceId: data.workspaceId, deletedAt: null },
    });
    if (!doc) throw new Error('Document not found');

    await prisma.kbDocument.update({ where: { id: doc.id }, data: { status: 'PARSING' } });

    let parsed;
    if (doc.sourceType === 'TEXT') {
      const text = doc.rawContent?.trim();
      if (!text) throw new Error('Пустой текст');
      parsed = {
        text,
        metadata: { sourceFormat: doc.mimeType, title: doc.title, wordCount: text.split(/\s+/).length },
      };
    } else {
      ensureParserRegistry();
      const buffer = await downloadBuffer(doc.storageKey);
      parsed = await parserRegistry.parse(doc.mimeType, buffer, doc.filename);
    }

    if (!parsed.text.trim()) throw new Error('No extractable text');

    const docMeta = extractDocumentMetadata(parsed.text, doc.mimeType, doc.title);
    const documentType =
      parsed.metadata.documentType ?? docMeta.documentType ?? 'general';

    const storageKey =
      doc.storageKey ||
      `workspaces/${data.workspaceId}/kb/${data.knowledgeBaseId}/${doc.id}/content.txt`;
    const parsedKey = await uploadParsedText(storageKey, parsed.text);

    await prisma.kbDocument.update({
      where: { id: doc.id },
      data: {
        storageKey: doc.storageKey || storageKey,
        parsedStorageKey: parsedKey,
        title: doc.title || parsed.metadata.title || docMeta.title || doc.filename,
        status: 'CHUNKING',
        category: docMeta.category ?? undefined,
        tags: docMeta.tags ?? [],
        language: docMeta.language ?? 'ru',
        documentType,
        metadata: { ...(docMeta as object), parserDocumentType: parsed.metadata.documentType },
      },
    });

    await chunkQueue.add(
      'chunk',
      { ...data, parsedStorageKey: parsedKey, pdfPages: parsed.pages },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  });
}

interface ChunkJob extends DocJob {
  pdfPages?: string[];
}

async function chunkDocument(data: ChunkJob): Promise<void> {
  await withFailureHandling(data.documentId, async () => {
    const doc = await prisma.kbDocument.findFirst({
      where: { id: data.documentId, workspaceId: data.workspaceId, deletedAt: null },
    });
    if (!doc) throw new Error('Document not found');

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: data.knowledgeBaseId, workspaceId: data.workspaceId },
    });
    if (!kb) throw new Error('KB not found');

    const chunkerConfig: ChunkerConfig = {
      maxChunkTokens: kb.chunkSize,
      overlapTokens: kb.chunkOverlap,
    };

    const readKey = data.parsedStorageKey ?? doc.parsedStorageKey ?? doc.storageKey;
    const buffer = await downloadBuffer(readKey);
    const text = buffer.toString('utf8');

    let chunks: SmartChunk[];
    if (data.pdfPages && data.pdfPages.length > 0) {
      chunks = smartChunkPdfPages(data.pdfPages, chunkerConfig);
    } else if (kb.chunkStrategy === 'fixed') {
      chunks =
        doc.mimeType === 'text/markdown'
          ? chunkMarkdown(text, chunkerConfig).map((c) => ({ ...c, metadata: {} }))
          : chunkPlainText(text, chunkerConfig).map((c) => ({ ...c, metadata: {} }));
    } else {
      chunks = smartChunk(text, doc.mimeType, {
        ...chunkerConfig,
        documentType: doc.documentType as 'text' | 'markdown' | 'faq' | 'general' | undefined,
        enableMetadataExtraction: kb.metadataExtractionEnabled,
      });
    }

    if (chunks.length === 0) throw new Error('No chunks produced');

    await prisma.kbChunk.deleteMany({ where: { documentId: doc.id } });

    const chunkIdByIndex = new Map<number, string>();
    let tokenCount = 0;

    for (const chunk of chunks) {
      tokenCount += chunk.tokenCount;
      const parentChunkId =
        chunk.parentChunkIndex != null ? chunkIdByIndex.get(chunk.parentChunkIndex) : undefined;

      const created = await prisma.kbChunk.create({
        data: {
          workspaceId: data.workspaceId,
          knowledgeBaseId: data.knowledgeBaseId,
          documentId: doc.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          sourcePage: chunk.sourcePage,
          sourceSection: chunk.sourceSection,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          contentHash: chunk.contentHash,
          hasEmbedding: false,
          topic: chunk.metadata.topic ?? null,
          tags: chunk.metadata.tags ?? [],
          hierarchyLevel: chunk.metadata.hierarchyLevel ?? 0,
          parentChunkId: parentChunkId ?? null,
          metadata: enrichChunkMetadata(
            chunk.metadata as Record<string, unknown>,
            (chunk.metadata as Record<string, unknown>).sectionPath as string[] | undefined,
          ) as object,
          retrievalPriority: doc.retrievalPriority ?? 1.0,
        },
      });
      chunkIdByIndex.set(chunk.chunkIndex, created.id);
    }

    await prisma.kbDocument.update({
      where: { id: doc.id },
      data: { status: 'EMBEDDING', chunkCount: chunks.length, tokenCount },
    });

    await embedQueue.add('embed', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  });
}

async function embedDocument(data: DocJob): Promise<void> {
  await withFailureHandling(data.documentId, async () => {
    const doc = await prisma.kbDocument.findFirst({
      where: { id: data.documentId, workspaceId: data.workspaceId, deletedAt: null },
    });
    if (!doc) throw new Error('Document not found');

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: data.knowledgeBaseId, workspaceId: data.workspaceId },
    });
    if (!kb) throw new Error('Knowledge base not found');

    const root = await findRootOpenRouter(data.workspaceId);
    if (!root) throw new Error('Root OpenRouter integration not found');

    if (kb.embeddingIntegrationId !== root.id) {
      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: { embeddingIntegrationId: root.id },
      });
    }

    const masterKey = process.env['MASTER_ENCRYPTION_KEY'];
    if (!masterKey || masterKey.length !== 64) throw new Error('MASTER_ENCRYPTION_KEY invalid');

    const crypto = new EnvelopeEncryptionService(masterKey);
    const apiKey = crypto.decrypt(
      crypto.unpack(Buffer.from(root.encryptedSecret), root.keyVersion),
      data.workspaceId,
    );

    const adapter = aiProviderFactory.create(root.provider, { apiKey });
    const chunks = await prisma.kbChunk.findMany({
      where: { documentId: doc.id, workspaceId: data.workspaceId, hasEmbedding: false },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      await prisma.kbDocument.update({
        where: { id: doc.id },
        data: { status: 'INDEXED', indexedAt: new Date(), errorMessage: null },
      });
      return;
    }

    const preferredModel = kb.embeddingModelId || KB_EMBEDDING_MODEL_TIERS[0]!;
    const batchSize = 32;
    let usedModel = preferredModel;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const tiers = [
        preferredModel,
        ...KB_EMBEDDING_MODEL_TIERS.filter((m) => m !== preferredModel),
      ];
      const result = await embedWithModelFallback(
        adapter,
        batch.map((c) => c.content),
        tiers,
      );
      usedModel = result.modelId;

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const vector = result.embeddings[j];
        if (!vector) continue;
        const literal = `[${vector.join(',')}]`;
        await prisma.$executeRaw(
          Prisma.sql`UPDATE kb_chunks SET embedding = ${Prisma.raw(`'${literal}'`)}::vector, "hasEmbedding" = true WHERE id = ${chunk.id}`,
        );
      }
    }

    if (usedModel !== kb.embeddingModelId) {
      await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: { embeddingModelId: usedModel },
      });
    }

    const wasIndexed = doc.status === 'INDEXED';
    await prisma.kbDocument.update({
      where: { id: doc.id },
      data: { status: 'INDEXED', indexedAt: new Date(), errorMessage: null },
    });

    if (!wasIndexed) {
      await prisma.knowledgeBase.update({
        where: { id: data.knowledgeBaseId },
        data: {
          documentCount: { increment: 1 },
          chunkCount: { increment: doc.chunkCount },
          tokenCount: { increment: doc.tokenCount },
        },
      });
    }
  });
}

async function cleanupDocument(data: DocJob): Promise<void> {
  const doc = await prisma.kbDocument.findFirst({ where: { id: data.documentId } });
  if (!doc) return;

  const chunkCount = await prisma.kbChunk.count({ where: { documentId: doc.id } });
  await prisma.kbChunk.deleteMany({ where: { documentId: doc.id } });

  for (const key of [doc.storageKey, doc.parsedStorageKey].filter(Boolean)) {
    try {
      await s3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key! }));
    } catch {
      /* ignore */
    }
  }

  if (doc.status === 'INDEXED') {
    await prisma.knowledgeBase.update({
      where: { id: doc.knowledgeBaseId },
      data: {
        documentCount: { decrement: 1 },
        chunkCount: { decrement: chunkCount || doc.chunkCount },
        tokenCount: { decrement: doc.tokenCount },
      },
    });
  }
}

const chunkQueue = new Queue('kb.chunk', { connection });
const embedQueue = new Queue('kb.embed', { connection });

export function startKbWorkers(): void {
  new Worker<DocJob>('kb.crawl', async (job) => crawlDocument(job.data), {
    connection,
    concurrency: 1,
  });
  new Worker<DocJob>('kb.parse', async (job) => parseDocument(job.data), {
    connection,
    concurrency: 2,
  });
  new Worker<ChunkJob>('kb.chunk', async (job) => chunkDocument(job.data), {
    connection,
    concurrency: 2,
  });
  new Worker<DocJob>('kb.embed', async (job) => embedDocument(job.data), {
    connection,
    concurrency: 1,
  });
  new Worker<DocJob>('kb.cleanup', async (job) => cleanupDocument(job.data), {
    connection,
    concurrency: 2,
  });
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
