import type { TextChunk } from '../chunker.js';

export type DocumentKind =
  | 'text'
  | 'markdown'
  | 'pdf'
  | 'url'
  | 'html'
  | 'faq'
  | 'notes'
  | 'docs'
  | 'support'
  | 'legal'
  | 'crm'
  | 'website'
  | 'general';

export interface ChunkMetadata {
  category?: string;
  tags?: string[];
  topic?: string;
  sectionTitle?: string;
  hierarchyLevel?: number;
  documentType?: string;
  language?: string;
  retrievalHint?: string;
  isCodeBlock?: boolean;
  isTable?: boolean;
  isFaqPair?: boolean;
  parentSectionIndex?: number;
}

export interface SmartChunk extends TextChunk {
  metadata: ChunkMetadata;
  parentChunkIndex?: number;
}

export interface DocumentMetadata {
  title?: string;
  category?: string;
  tags?: string[];
  topic?: string;
  language?: string;
  documentType?: DocumentKind;
  summary?: string;
  sourceType?: string;
  retrievalPriority?: number;
  sections?: Array<{ title: string; level: number; startOffset: number }>;
}

export interface SmartChunkOptions {
  maxChunkTokens?: number;
  overlapTokens?: number;
  documentType?: DocumentKind;
  language?: string;
  enableMetadataExtraction?: boolean;
}
