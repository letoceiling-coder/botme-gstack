import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@botme/database';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import {
  assertSafeFetchUrl,
  canonicalizeUrl,
} from '@botme/ai-core';
import type {
  CreateKnowledgeBaseInput,
  CreateTextDocumentInput,
  CreateUrlDocumentInput,
  KnowledgeBaseDto,
  KbChunksPageDto,
  KbDocumentDto,
  PreviewChunksResultDto,
  RetrieveTestInput,
  RetrieveTestResultDto,
  UpdateKnowledgeBaseInput,
  UpdateTextDocumentInput,
  UploadDocumentInput,
  UploadUrlDto,
} from '@botme/shared';
import { RedisService } from '../../../core/redis/redis.service';
import { S3StorageService } from '../../../core/storage/s3-storage.service';
import { KnowledgeBaseRepository } from '../infrastructure/knowledge-base.repository';
import { KbDocumentRepository } from '../infrastructure/kb-document.repository';
import { KbChunkRepository } from '../infrastructure/kb-chunk.repository';
import { KbChunkPreviewService } from './kb-chunk-preview.service';
import { KbRetrievalTestService } from './kb-retrieval-test.service';
import { KbIntegrityService } from './kb-integrity.service';
import { KbHealingService } from './kb-healing.service';
import { KnowledgeBaseModelRouter } from './knowledge-base-model-router.service';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private readonly parseQueue: Queue;
  private readonly crawlQueue: Queue;
  private readonly embedQueue: Queue;
  private readonly cleanupQueue: Queue;

  constructor(
    private readonly knowledgeBases: KnowledgeBaseRepository,
    private readonly documents: KbDocumentRepository,
    private readonly chunks: KbChunkRepository,
    private readonly retrievalTest: KbRetrievalTestService,
    private readonly chunkPreview: KbChunkPreviewService,
    private readonly modelRouter: KnowledgeBaseModelRouter,
    private readonly integrity: KbIntegrityService,
    private readonly healing: KbHealingService,
    private readonly storage: S3StorageService,
    redis: RedisService,
  ) {
    const connection = redis.client;
    this.parseQueue = new Queue('kb.parse', { connection });
    this.crawlQueue = new Queue('kb.crawl', { connection });
    this.embedQueue = new Queue('kb.embed', { connection });
    this.cleanupQueue = new Queue('kb.cleanup', { connection });
  }

  list(workspaceId: string): Promise<KnowledgeBaseDto[]> {
    return this.knowledgeBases.list(workspaceId).then((rows) => rows.map((r) => this.toKbDto(r)));
  }

  async get(workspaceId: string, id: string): Promise<KnowledgeBaseDto> {
    const row = await this.knowledgeBases.findById(workspaceId, id);
    if (!row) throw new NotFoundException('База знаний не найдена');
    return this.toKbDto(row);
  }

  async create(workspaceId: string, input: CreateKnowledgeBaseInput): Promise<KnowledgeBaseDto> {
    const root = await this.modelRouter.resolveRootIntegration(workspaceId);
    const row = await this.knowledgeBases.create({
      workspace: { connect: { id: workspaceId } },
      name: input.name,
      description: input.description ?? '',
      embeddingIntegration: { connect: { id: root.id } },
      embeddingModelId: input.embeddingModelId ?? this.modelRouter.defaultEmbeddingModel(),
    });
    return this.toKbDto(row);
  }

  async deleteKnowledgeBase(workspaceId: string, id: string): Promise<{ ok: true }> {
    await this.ensureKb(workspaceId, id);
    const docs = await this.documents.listByKb(workspaceId, id);

    await this.knowledgeBases.softDelete(id);

    for (const doc of docs) {
      await this.documents.softDelete(doc.id, doc.fileHash);
      await this.cleanupQueue.add('cleanup', {
        documentId: doc.id,
        workspaceId,
        knowledgeBaseId: id,
      });
    }

    return { ok: true };
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateKnowledgeBaseInput,
  ): Promise<KnowledgeBaseDto> {
    await this.ensureKb(workspaceId, id);
    const root = await this.modelRouter.resolveRootIntegration(workspaceId);
    const row = await this.knowledgeBases.update(id, {
      name: input.name,
      description: input.description,
      embeddingIntegration: { connect: { id: root.id } },
      embeddingModelId: input.embeddingModelId,
      chunkSize: input.chunkSize,
      chunkOverlap: input.chunkOverlap,
      retrievalTopK: input.retrievalTopK,
      similarityThreshold: input.similarityThreshold,
      rerankEnabled: input.rerankEnabled,
      citationMode: input.citationMode,
      chunkStrategy: input.chunkStrategy,
      hybridRetrievalEnabled: input.hybridRetrievalEnabled,
      metadataExtractionEnabled: input.metadataExtractionEnabled,
      aiEnrichmentEnabled: input.aiEnrichmentEnabled,
      semanticMode: input.semanticMode,
    });
    return this.toKbDto(row);
  }

  listDocuments(workspaceId: string, kbId: string): Promise<KbDocumentDto[]> {
    return this.ensureKb(workspaceId, kbId).then(() =>
      this.documents.listByKb(workspaceId, kbId).then((rows) => rows.map((r) => this.toDocDto(r))),
    );
  }

  async getDocument(
    workspaceId: string,
    kbId: string,
    documentId: string,
  ): Promise<KbDocumentDto & { rawContent?: string | null }> {
    const doc = await this.getDocOrThrow(workspaceId, kbId, documentId);
    return { ...this.toDocDto(doc), rawContent: doc.rawContent };
  }

  async createUploadUrl(
    workspaceId: string,
    kbId: string,
    input: UploadDocumentInput,
  ): Promise<UploadUrlDto> {
    await this.ensureKb(workspaceId, kbId);
    await this.assertNoDuplicateHash(workspaceId, kbId, input.fileHash);

    const doc = await this.createDocumentSafe({
      workspace: { connect: { id: workspaceId } },
      knowledgeBase: { connect: { id: kbId } },
      sourceType: 'FILE',
      title: input.filename,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      fileHash: input.fileHash,
      storageKey: 'pending',
      status: 'PENDING',
    });

    const storageKey = this.storage.buildObjectKey(workspaceId, kbId, doc.id, input.filename);
    await this.documents.update(doc.id, { storageKey, status: 'UPLOADED' });

    const uploadUrl = await this.storage.createUploadUrl(storageKey, input.mimeType);
    this.logger.log(
      `upload-url kbId=${kbId} docId=${doc.id} workspaceId=${workspaceId} key=${storageKey}`,
    );
    return { documentId: doc.id, uploadUrl, storageKey };
  }

  /** API-mediated upload — avoids presigned URL signature mismatch via nginx path rewrite. */
  async uploadFile(
    workspaceId: string,
    kbId: string,
    input: UploadDocumentInput,
    fileBuffer: Buffer,
  ): Promise<KbDocumentDto> {
    await this.ensureKb(workspaceId, kbId);
    await this.assertNoDuplicateHash(workspaceId, kbId, input.fileHash);

    const doc = await this.createDocumentSafe({
      workspace: { connect: { id: workspaceId } },
      knowledgeBase: { connect: { id: kbId } },
      sourceType: 'FILE',
      title: input.filename,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      fileHash: input.fileHash,
      storageKey: 'pending',
      status: 'PENDING',
    });

    const storageKey = this.storage.buildObjectKey(workspaceId, kbId, doc.id, input.filename);
    try {
      await this.storage.putObject(storageKey, fileBuffer, input.mimeType);
      const updated = await this.documents.update(doc.id, { storageKey, status: 'UPLOADED' });
      await this.enqueueParse(doc.id, workspaceId, kbId);
      this.logger.log(
        `upload ok kbId=${kbId} docId=${doc.id} workspaceId=${workspaceId} key=${storageKey} bytes=${fileBuffer.length}`,
      );
      return this.toDocDto(updated);
    } catch (err: unknown) {
      await this.rollbackFailedUpload(workspaceId, kbId, doc.id);
      throw err;
    }
  }

  async getIngestionStatus(workspaceId: string, kbId: string) {
    await this.ensureKb(workspaceId, kbId);
    const docs = await this.documents.listByKb(workspaceId, kbId);
    const byStatus: Record<string, number> = {};
    for (const d of docs) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    }
    const failedChunks = await this.chunks.countWithoutEmbedding(workspaceId, kbId);
    const kb = await this.knowledgeBases.findById(workspaceId, kbId);
    return {
      knowledgeBaseId: kbId,
      documentCount: docs.length,
      documentsByStatus: byStatus,
      chunkCount: kb?.chunkCount ?? 0,
      tokenCount: kb?.tokenCount ?? 0,
      pendingEmbeddings: failedChunks,
      embeddingModelId: kb?.embeddingModelId ?? null,
      embeddingIntegrationId: kb?.embeddingIntegrationId ?? null,
    };
  }

  async getDiagnostics(workspaceId: string, kbId: string) {
    const ingestion = await this.getIngestionStatus(workspaceId, kbId);
    const integrity = await this.integrity.auditKnowledgeBase(workspaceId, kbId);
    return { ingestion, integrity };
  }

  healKnowledgeBase(workspaceId: string, kbId: string) {
    return this.healing.healKnowledgeBase(workspaceId, kbId);
  }

  async rollbackFailedUpload(
    workspaceId: string,
    kbId: string,
    documentId: string,
  ): Promise<void> {
    try {
      const doc = await this.documents.findById(workspaceId, documentId);
      if (!doc || doc.knowledgeBaseId !== kbId) return;
      if (doc.status === 'INDEXED') return;
      if (doc.storageKey && doc.storageKey !== 'pending') {
        await this.storage.deleteObject(doc.storageKey).catch(() => undefined);
      }
      await this.documents.softDelete(documentId, doc.fileHash);
    } catch (err: unknown) {
      this.logger.warn(
        `upload rollback failed docId=${documentId} reason=${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  async confirmUpload(workspaceId: string, kbId: string, documentId: string): Promise<{ ok: true }> {
    await this.getDocOrThrow(workspaceId, kbId, documentId);
    await this.enqueueParse(documentId, workspaceId, kbId);
    return { ok: true };
  }

  async createTextDocument(
    workspaceId: string,
    kbId: string,
    input: CreateTextDocumentInput,
  ): Promise<KbDocumentDto> {
    await this.ensureKb(workspaceId, kbId);
    const fileHash = createHash('sha256').update(input.content).digest('hex');
    await this.assertNoDuplicateHash(workspaceId, kbId, fileHash);

    const doc = await this.createDocumentSafe({
      workspace: { connect: { id: workspaceId } },
      knowledgeBase: { connect: { id: kbId } },
      sourceType: 'TEXT',
      title: input.title,
      filename: `${input.title}.md`,
      mimeType: input.mimeType,
      sizeBytes: Buffer.byteLength(input.content, 'utf8'),
      fileHash,
      rawContent: input.content,
      storageKey: '',
      status: 'QUEUED',
      documentType: input.mimeType === 'text/markdown' ? 'markdown' : 'text',
      language: 'ru',
    });

    await this.enqueueParse(doc.id, workspaceId, kbId);
    return this.toDocDto(doc);
  }

  async updateTextDocument(
    workspaceId: string,
    kbId: string,
    documentId: string,
    input: UpdateTextDocumentInput,
  ): Promise<KbDocumentDto> {
    const doc = await this.getDocOrThrow(workspaceId, kbId, documentId);
    if (doc.sourceType !== 'TEXT') {
      throw new BadRequestException('Редактирование доступно только для TEXT источников');
    }

    const content = input.content ?? doc.rawContent ?? '';
    const fileHash = createHash('sha256').update(content).digest('hex');

    const updated = await this.documents.update(documentId, {
      title: input.title ?? doc.title,
      rawContent: input.content ?? doc.rawContent,
      fileHash,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      status: 'QUEUED',
      errorMessage: null,
    });

    await this.enqueueParse(documentId, workspaceId, kbId);
    return this.toDocDto(updated);
  }

  previewTextChunks(
    workspaceId: string,
    kbId: string,
    content: string,
    mimeType: 'text/plain' | 'text/markdown',
  ): Promise<PreviewChunksResultDto> {
    return this.ensureKb(workspaceId, kbId).then((kb) =>
      this.chunkPreview.preview(workspaceId, kbId, content, mimeType, kb.chunkSize, kb.chunkOverlap),
    );
  }

  async createUrlDocument(
    workspaceId: string,
    kbId: string,
    input: CreateUrlDocumentInput,
  ): Promise<KbDocumentDto> {
    await this.ensureKb(workspaceId, kbId);
    const safeUrl = await assertSafeFetchUrl(input.url);
    const canonical = canonicalizeUrl(safeUrl.toString());
    const fileHash = createHash('sha256').update(canonical).digest('hex');
    await this.assertNoDuplicateHash(workspaceId, kbId, fileHash);

    const doc = await this.createDocumentSafe({
      workspace: { connect: { id: workspaceId } },
      knowledgeBase: { connect: { id: kbId } },
      sourceType: 'URL',
      title: input.title ?? safeUrl.hostname,
      filename: `${safeUrl.hostname}.html`,
      mimeType: 'text/html',
      fileHash,
      sourceUrl: canonical,
      storageKey: '',
      crawlConfig: {
        startUrl: canonical,
        maxDepth: input.maxDepth,
        maxPages: input.maxPages,
        includePatterns: input.includePatterns,
        excludePatterns: input.excludePatterns,
        respectRobots: input.respectRobots,
      },
      status: 'QUEUED',
    });

    await this.crawlQueue.add(
      'crawl',
      { documentId: doc.id, workspaceId, knowledgeBaseId: kbId },
      { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
    );

    return this.toDocDto(doc);
  }

  async retryDocument(
    workspaceId: string,
    kbId: string,
    documentId: string,
  ): Promise<{ ok: true }> {
    const doc = await this.getDocOrThrow(workspaceId, kbId, documentId);
    await this.modelRouter.syncKbEmbeddingIntegration(workspaceId, kbId).catch((err: unknown) => {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(
        `retry doc=${documentId}: integration sync failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    });

    await this.documents.update(documentId, {
      status: 'RETRYING',
      errorMessage: null,
      retryCount: { increment: 1 },
    });

    if (doc.sourceType === 'URL') {
      await this.crawlQueue.add(
        'crawl',
        { documentId, workspaceId, knowledgeBaseId: kbId },
        { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
      );
    } else if (doc.chunkCount > 0) {
      await this.documents.update(documentId, { status: 'EMBEDDING' });
      await this.embedQueue.add(
        'embed',
        { documentId, workspaceId, knowledgeBaseId: kbId },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } else {
      await this.enqueueParse(documentId, workspaceId, kbId);
    }
    return { ok: true };
  }

  async listChunks(
    workspaceId: string,
    kbId: string,
    documentId: string,
    page = 1,
    pageSize = 20,
    search?: string,
  ): Promise<KbChunksPageDto> {
    await this.getDocOrThrow(workspaceId, kbId, documentId);
    const { items, total } = await this.chunks.listByDocument(
      workspaceId,
      documentId,
      page,
      pageSize,
      search,
    );
    return {
      items: items.map((c) => ({
        id: c.id,
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        sourcePage: c.sourcePage,
        sourceSection: c.sourceSection,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        hasEmbedding: c.hasEmbedding,
        topic: c.topic,
        hierarchyLevel: c.hierarchyLevel,
        parentChunkId: c.parentChunkId,
        tags: c.tags,
        metadata: (c.metadata ?? {}) as Record<string, unknown>,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async runRetrievalTest(
    workspaceId: string,
    kbId: string,
    input: RetrieveTestInput,
  ): Promise<RetrieveTestResultDto> {
    await this.ensureKb(workspaceId, kbId);
    return this.retrievalTest.testRetrieval(
      workspaceId,
      kbId,
      input.query,
      input.topK,
      input.minScore,
    );
  }

  async deleteDocument(workspaceId: string, kbId: string, documentId: string): Promise<{ ok: true }> {
    const doc = await this.getDocOrThrow(workspaceId, kbId, documentId);
    await this.documents.softDelete(documentId, doc.fileHash);
    await this.cleanupQueue.add('cleanup', { documentId, workspaceId, knowledgeBaseId: kbId });
    return { ok: true };
  }

  private async enqueueParse(documentId: string, workspaceId: string, kbId: string): Promise<void> {
    await this.documents.update(documentId, { status: 'PARSING' });
    await this.parseQueue.add(
      'parse',
      { documentId, workspaceId, knowledgeBaseId: kbId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }

  private async assertNoDuplicateHash(
    workspaceId: string,
    kbId: string,
    fileHash: string,
  ): Promise<void> {
    const dup = await this.documents.findActiveByHash(workspaceId, kbId, fileHash);
    if (dup) throw new ConflictException('Документ с таким содержимым уже существует');
  }

  private async createDocumentSafe(data: Parameters<KbDocumentRepository['create']>[0]): Promise<
    Awaited<ReturnType<KbDocumentRepository['create']>>
  > {
    try {
      return await this.documents.create(data);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Документ с таким содержимым уже существует');
      }
      throw err;
    }
  }

  private async getDocOrThrow(workspaceId: string, kbId: string, documentId: string) {
    const doc = await this.documents.findById(workspaceId, documentId);
    if (!doc || doc.knowledgeBaseId !== kbId) {
      throw new NotFoundException('Документ не найден');
    }
    return doc;
  }

  private async ensureKb(workspaceId: string, id: string) {
    const row = await this.knowledgeBases.findById(workspaceId, id);
    if (!row) throw new NotFoundException('База знаний не найдена');
    return row;
  }

  private toKbDto(row: {
    id: string;
    name: string;
    description: string;
    status: string;
    embeddingIntegrationId: string | null;
    embeddingModelId: string;
    chunkSize: number;
    chunkOverlap: number;
    retrievalTopK: number;
    similarityThreshold: number;
    rerankEnabled: boolean;
    citationMode: string;
    chunkStrategy: string;
    hybridRetrievalEnabled: boolean;
    metadataExtractionEnabled: boolean;
    aiEnrichmentEnabled: boolean;
    semanticMode: string;
    documentCount: number;
    chunkCount: number;
    tokenCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): KnowledgeBaseDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      embeddingIntegrationId: row.embeddingIntegrationId,
      embeddingModelId: row.embeddingModelId,
      chunkSize: row.chunkSize,
      chunkOverlap: row.chunkOverlap,
      retrievalTopK: row.retrievalTopK,
      similarityThreshold: row.similarityThreshold,
      rerankEnabled: row.rerankEnabled,
      citationMode: row.citationMode as KnowledgeBaseDto['citationMode'],
      chunkStrategy: row.chunkStrategy,
      hybridRetrievalEnabled: row.hybridRetrievalEnabled,
      metadataExtractionEnabled: row.metadataExtractionEnabled,
      aiEnrichmentEnabled: row.aiEnrichmentEnabled,
      semanticMode: row.semanticMode,
      documentCount: row.documentCount,
      chunkCount: row.chunkCount,
      tokenCount: row.tokenCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDocDto(row: {
    id: string;
    sourceType: string;
    title: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sourceUrl: string | null;
    status: string;
    errorMessage: string | null;
    retryCount: number;
    chunkCount: number;
    tokenCount: number;
    indexedAt: Date | null;
    category?: string | null;
    tags?: string[];
    language?: string;
    documentType?: string;
    createdAt: Date;
    updatedAt: Date;
  }): KbDocumentDto {
    return {
      id: row.id,
      sourceType: row.sourceType as KbDocumentDto['sourceType'],
      title: row.title,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sourceUrl: row.sourceUrl,
      status: row.status,
      errorMessage: row.errorMessage,
      retryCount: row.retryCount,
      chunkCount: row.chunkCount,
      tokenCount: row.tokenCount,
      indexedAt: row.indexedAt?.toISOString() ?? null,
      category: row.category ?? null,
      tags: row.tags ?? [],
      language: row.language ?? 'ru',
      documentType: row.documentType ?? 'general',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
