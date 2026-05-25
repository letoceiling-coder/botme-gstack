import { Module } from '@nestjs/common';
import { S3StorageService } from '../../core/storage/s3-storage.service';
import { KbChunkPreviewService } from './application/kb-chunk-preview.service';
import { KbHealingService } from './application/kb-healing.service';
import { KbIntegrityService } from './application/kb-integrity.service';
import { KbRetrievalOrchestrator } from './application/kb-retrieval-orchestrator.service';
import { KnowledgeBaseModelRouter } from './application/knowledge-base-model-router.service';
import { KnowledgeBaseService } from './application/knowledge-base.service';
import { RagRetrievalService } from './application/rag-retrieval.service';
import { KbRetrievalTestService } from './application/kb-retrieval-test.service';
import { KbChunkRepository } from './infrastructure/kb-chunk.repository';
import { KbDocumentRepository } from './infrastructure/kb-document.repository';
import { KnowledgeBaseRepository } from './infrastructure/knowledge-base.repository';
import { VectorSearchService } from './infrastructure/vector-search.service';
import { KnowledgeBaseController } from './presentation/knowledge-base.controller';

@Module({
  controllers: [KnowledgeBaseController],
  providers: [
    S3StorageService,
    KbChunkPreviewService,
    KbIntegrityService,
    KbHealingService,
    KbRetrievalOrchestrator,
    KnowledgeBaseModelRouter,
    KnowledgeBaseService,
    RagRetrievalService,
    KbRetrievalTestService,
    KnowledgeBaseRepository,
    KbDocumentRepository,
    KbChunkRepository,
    VectorSearchService,
  ],
  exports: [KnowledgeBaseService, RagRetrievalService, VectorSearchService],
})
export class KnowledgeModule {}
