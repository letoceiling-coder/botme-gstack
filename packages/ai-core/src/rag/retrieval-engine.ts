export type RetrievalConfidence = 'high' | 'medium' | 'low' | 'none';

export interface RetrievalConfidenceResult {
  level: RetrievalConfidence;
  score: number;
  topScore: number;
  hitCount: number;
  avgScore: number;
  spread: number;
}

export interface AdaptiveRetrievalParams {
  topK: number;
  minScore: number;
  expandedQuery: string;
}

export function expandQuery(query: string): string {
  const normalized = query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  const terms = normalized.split(/\s+/).filter((t) => t.length > 1);
  if (terms.length <= 3) return normalized;
  return normalized;
}

export function adaptTopK(query: string, baseTopK: number): number {
  const words = query.trim().split(/\s+/).length;
  if (words <= 3) return Math.min(baseTopK + 2, 20);
  if (words >= 12) return Math.max(4, baseTopK - 2);
  return baseTopK;
}

export function adaptThreshold(
  scores: number[],
  baseThreshold: number,
): number {
  if (scores.length === 0) return baseThreshold;
  const top = scores[0] ?? 0;
  if (top >= 0.88) return Math.max(baseThreshold, top - 0.12);
  if (top < 0.65) return Math.max(0.55, baseThreshold - 0.08);
  return baseThreshold;
}

export function computeRetrievalConfidence(
  hits: Array<{ score: number }>,
): RetrievalConfidenceResult {
  if (hits.length === 0) {
    return { level: 'none', score: 0, topScore: 0, hitCount: 0, avgScore: 0, spread: 0 };
  }

  const scores = hits.map((h) => h.score).sort((a, b) => b - a);
  const topScore = scores[0] ?? 0;
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const spread = scores.length > 1 ? (scores[0] ?? 0) - (scores[scores.length - 1] ?? 0) : 0;

  let level: RetrievalConfidence;
  let score: number;

  if (topScore >= 0.82 && hits.length >= 2 && spread >= 0.05) {
    level = 'high';
    score = Math.min(1, topScore * 0.7 + avgScore * 0.3);
  } else if (topScore >= 0.68 || (topScore >= 0.6 && hits.length >= 3)) {
    level = 'medium';
    score = Math.min(0.85, topScore * 0.6 + avgScore * 0.4);
  } else if (topScore >= 0.5) {
    level = 'low';
    score = topScore * 0.5;
  } else {
    level = 'none';
    score = topScore;
  }

  return {
    level,
    score: Math.round(score * 1000) / 1000,
    topScore: Math.round(topScore * 1000) / 1000,
    hitCount: hits.length,
    avgScore: Math.round(avgScore * 1000) / 1000,
    spread: Math.round(spread * 1000) / 1000,
  };
}

export function resolveAdaptiveRetrieval(
  query: string,
  baseTopK: number,
  baseThreshold: number,
  candidateScores: number[],
): AdaptiveRetrievalParams {
  return {
    topK: adaptTopK(query, baseTopK),
    minScore: adaptThreshold(candidateScores, baseThreshold),
    expandedQuery: expandQuery(query),
  };
}

export interface RerankCandidate {
  chunkId: string;
  content: string;
  score: number;
  vectorScore: number;
  keywordBoost: number;
  sourceSection?: string | null;
  topic?: string | null;
}

/** Lightweight semantic rerank — term overlap + section/topic boost (no cross-encoder). */
export function semanticRerank(
  hits: RerankCandidate[],
  query: string,
): RerankCandidate[] {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  return [...hits]
    .map((h) => {
      const haystack = `${h.content} ${h.sourceSection ?? ''} ${h.topic ?? ''}`.toLowerCase();
      let termHits = 0;
      for (const t of terms) {
        if (haystack.includes(t)) termHits++;
      }
      const rerankBoost = terms.length ? (termHits / terms.length) * 0.08 : 0;
      const rerankScore = Math.min(1, h.score + rerankBoost);
      return { ...h, score: rerankScore };
    })
    .sort((a, b) => b.score - a.score);
}

export function compressDuplicateChunks<T extends { chunkId: string; content: string; documentId: string }>(
  hits: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const hit of hits) {
    const key = hit.content.slice(0, 180).replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(hit);
  }
  return result;
}
