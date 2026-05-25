import { z } from 'zod';

export const DocumentSourceSchema = z.enum(['TEXT', 'FILE', 'URL']);
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;

export const CitationModeSchema = z.enum(['INLINE', 'FOOTNOTE', 'OFF']);
export type CitationMode = z.infer<typeof CitationModeSchema>;

export const PreviewChunksSchema = z.object({
  content: z.string().max(500_000).default(''),
  mimeType: z.enum(['text/plain', 'text/markdown']).default('text/markdown'),
});

export type PreviewChunksInput = z.infer<typeof PreviewChunksSchema>;

export interface PreviewChunksResultDto {
  tokenCount: number;
  chunkCount: number;
  chunks: Array<{
    chunkIndex: number;
    tokenCount: number;
    preview: string;
    topic: string | null;
    section: string | null;
  }>;
  metadata: Record<string, unknown>;
  stats: {
    strategy: string;
    fallback: boolean;
    previewLimit?: number;
    error?: string;
  };
}

export const CreateKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  embeddingIntegrationId: z.string().cuid().optional(),
  embeddingModelId: z.string().max(120).optional(),
});

export const UpdateKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  embeddingIntegrationId: z.string().cuid().nullable().optional(),
  embeddingModelId: z.string().max(120).optional(),
  chunkSize: z.number().int().min(128).max(4000).optional(),
  chunkOverlap: z.number().int().min(0).max(1000).optional(),
  retrievalTopK: z.number().int().min(1).max(50).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  rerankEnabled: z.boolean().optional(),
  citationMode: CitationModeSchema.optional(),
  chunkStrategy: z.enum(['smart', 'fixed']).optional(),
  hybridRetrievalEnabled: z.boolean().optional(),
  metadataExtractionEnabled: z.boolean().optional(),
  aiEnrichmentEnabled: z.boolean().optional(),
  semanticMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
});

export const UploadDocumentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum([
    'text/plain',
    'text/markdown',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/html',
  ]),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
  fileHash: z.string().min(32).max(128),
});

export const CreateTextDocumentSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(500_000),
  mimeType: z.enum(['text/plain', 'text/markdown']).default('text/markdown'),
});

export const UpdateTextDocumentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).max(500_000).optional(),
});

export const CreateUrlDocumentSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().max(255).optional(),
  maxDepth: z.number().int().min(0).max(3).default(0),
  maxPages: z.number().int().min(1).max(100).default(20),
  includePatterns: z.array(z.string().max(200)).max(10).optional(),
  excludePatterns: z.array(z.string().max(200)).max(10).optional(),
  respectRobots: z.boolean().default(true),
});

export const RetrieveTestSchema = z.object({
  query: z.string().min(1).max(4000),
  topK: z.number().int().min(1).max(50).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

export type CreateKnowledgeBaseInput = z.infer<typeof CreateKnowledgeBaseSchema>;
export type UpdateKnowledgeBaseInput = z.infer<typeof UpdateKnowledgeBaseSchema>;
export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>;
export type CreateTextDocumentInput = z.infer<typeof CreateTextDocumentSchema>;
export type UpdateTextDocumentInput = z.infer<typeof UpdateTextDocumentSchema>;
export type CreateUrlDocumentInput = z.infer<typeof CreateUrlDocumentSchema>;
export type RetrieveTestInput = z.infer<typeof RetrieveTestSchema>;

export interface KnowledgeBaseDto {
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
  citationMode: CitationMode;
  chunkStrategy: string;
  hybridRetrievalEnabled: boolean;
  metadataExtractionEnabled: boolean;
  aiEnrichmentEnabled: boolean;
  semanticMode: string;
  documentCount: number;
  chunkCount: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KbDocumentDto {
  id: string;
  sourceType: DocumentSource;
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
  indexedAt: string | null;
  category: string | null;
  tags: string[];
  language: string;
  documentType: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbChunkDto {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  sourcePage: number | null;
  sourceSection: string | null;
  startOffset: number;
  endOffset: number;
  hasEmbedding: boolean;
  topic: string | null;
  hierarchyLevel: number;
  parentChunkId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface KbChunksPageDto {
  items: KbChunkDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UploadUrlDto {
  documentId: string;
  uploadUrl: string;
  storageKey: string;
}

export interface RetrieveTestHitDto {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
  sourcePage: number | null;
  sourceSection: string | null;
  matchReason: string;
}

export interface RetrieveTestResultDto {
  query: string;
  embeddingLatencyMs: number;
  searchLatencyMs: number;
  promptPreview: string;
  promptTokenEstimate: number;
  truncated: boolean;
  retrievalConfidence?: 'high' | 'medium' | 'low' | 'none';
  confidenceScore?: number;
  embeddingModelUsed?: string;
  hits: RetrieveTestHitDto[];
  citations: CitationDto[];
  diagnostics?: {
    topScore: number;
    avgScore: number;
    spread: number;
    chunkIds: string[];
    scores: number[];
    embeddingIntegrationId: string;
  };
}

export interface CitationDto {
  chunkId: string;
  documentId: string;
  filename: string;
  page?: number | null;
  section?: string | null;
  score: number;
  label: string;
}
