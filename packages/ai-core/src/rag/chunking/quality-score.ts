import type { SmartChunk } from './types.js';

export interface ChunkQualityScore {
  semanticCompleteness: number;
  overlapEfficiency: number;
  headingIntegrity: number;
  tokenEfficiency: number;
  duplicationRisk: number;
  retrievalReadiness: number;
  overall: number;
}

export function scoreChunkQuality(
  chunk: SmartChunk,
  allChunks: SmartChunk[],
  opts?: { targetTokens?: number },
): ChunkQualityScore {
  const target = opts?.targetTokens ?? 512;
  const content = chunk.content.trim();
  const tokens = chunk.tokenCount || Math.ceil(content.length / 4);

  const semanticCompleteness = scoreSemanticCompleteness(content, chunk.metadata);
  const overlapEfficiency = scoreOverlapEfficiency(chunk, allChunks);
  const headingIntegrity = scoreHeadingIntegrity(content, chunk.metadata);
  const tokenEfficiency = scoreTokenEfficiency(tokens, target);
  const duplicationRisk = scoreDuplicationRisk(content, allChunks, chunk.chunkIndex);
  const retrievalReadiness = scoreRetrievalReadiness(chunk, semanticCompleteness, headingIntegrity);

  const overall =
    semanticCompleteness * 0.25 +
    overlapEfficiency * 0.1 +
    headingIntegrity * 0.15 +
    tokenEfficiency * 0.15 +
    (1 - duplicationRisk) * 0.15 +
    retrievalReadiness * 0.2;

  return {
    semanticCompleteness,
    overlapEfficiency,
    headingIntegrity,
    tokenEfficiency,
    duplicationRisk,
    retrievalReadiness,
    overall: Math.round(overall * 1000) / 1000,
  };
}

export function scoreDocumentChunks(chunks: SmartChunk[], targetTokens = 512) {
  const scores = chunks.map((c) => scoreChunkQuality(c, chunks, { targetTokens }));
  const avg = scores.reduce((s, x) => s + x.overall, 0) / (scores.length || 1);
  const tokenVariance = variance(chunks.map((c) => c.tokenCount));
  return {
    chunkCount: chunks.length,
    averageQuality: Math.round(avg * 1000) / 1000,
    tokenVariance: Math.round(tokenVariance),
    scores,
    issues: collectQualityIssues(chunks, scores),
  };
}

function scoreSemanticCompleteness(content: string, meta: SmartChunk['metadata']): number {
  let score = 0.5;
  if (content.length >= 80) score += 0.15;
  if (/[.!?…]\s*$/.test(content) || meta.isFaqPair || meta.isCodeBlock) score += 0.15;
  if (meta.sectionTitle || meta.topic) score += 0.1;
  if (meta.isTable && content.includes('|')) score += 0.1;
  return Math.min(1, score);
}

function scoreOverlapEfficiency(chunk: SmartChunk, all: SmartChunk[]): number {
  const prev = all.find((c) => c.chunkIndex === chunk.chunkIndex - 1);
  if (!prev) return 1;
  const overlap = longestCommonSubstring(prev.content.slice(-120), chunk.content.slice(0, 120));
  const ratio = overlap / Math.max(1, Math.min(prev.content.length, chunk.content.length));
  if (ratio > 0.6) return 0.3;
  if (ratio > 0.35) return 0.6;
  return 1;
}

function scoreHeadingIntegrity(content: string, meta: SmartChunk['metadata']): number {
  if (meta.isCodeBlock || meta.isTable || meta.isFaqPair) return 1;
  const opensHeading = /^#{1,6}\s/m.test(content);
  const closesMidHeading = /\n#{1,6}\s/.test(content.slice(0, -1)) && !content.endsWith('\n');
  if (meta.sectionTitle && !opensHeading) return 0.7;
  if (closesMidHeading) return 0.5;
  return 1;
}

function scoreTokenEfficiency(tokens: number, target: number): number {
  if (tokens < 32) return 0.4;
  const ratio = tokens / target;
  if (ratio >= 0.5 && ratio <= 1.1) return 1;
  if (ratio < 0.5) return 0.5 + ratio;
  return Math.max(0.3, 1 - (ratio - 1.1) * 0.5);
}

function scoreDuplicationRisk(content: string, all: SmartChunk[], index: number): number {
  const key = content.slice(0, 200);
  let dupes = 0;
  for (const c of all) {
    if (c.chunkIndex === index) continue;
    if (c.content.slice(0, 200) === key) dupes++;
  }
  return Math.min(1, dupes * 0.4);
}

function scoreRetrievalReadiness(
  chunk: SmartChunk,
  semantic: number,
  heading: number,
): number {
  let score = (semantic + heading) / 2;
  if (chunk.metadata.tags?.length) score += 0.05;
  if (chunk.metadata.retrievalHint) score += 0.05;
  if (chunk.metadata.hierarchyLevel != null && chunk.metadata.hierarchyLevel > 0) score += 0.05;
  return Math.min(1, score);
}

function collectQualityIssues(chunks: SmartChunk[], scores: ChunkQualityScore[]): string[] {
  const issues: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const s = scores[i]!;
    const c = chunks[i]!;
    if (s.semanticCompleteness < 0.5) issues.push(`chunk #${c.chunkIndex}: incomplete thought`);
    if (s.duplicationRisk > 0.5) issues.push(`chunk #${c.chunkIndex}: high duplication`);
    if (s.headingIntegrity < 0.6) issues.push(`chunk #${c.chunkIndex}: broken heading hierarchy`);
    if (c.metadata.isTable && !c.content.includes('|')) issues.push(`chunk #${c.chunkIndex}: table metadata mismatch`);
  }
  return issues.slice(0, 20);
}

function variance(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
}

function longestCommonSubstring(a: string, b: string): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      max = Math.max(max, k);
    }
  }
  return max;
}
