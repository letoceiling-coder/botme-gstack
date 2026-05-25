export function extractQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 12);
}

export function computeKeywordBoost(
  content: string,
  section: string | null | undefined,
  topic: string | null | undefined,
  terms: string[],
): number {
  if (terms.length === 0) return 0;
  const haystack = `${content} ${section ?? ''} ${topic ?? ''}`.toLowerCase();
  let matches = 0;
  for (const term of terms) {
    if (haystack.includes(term)) matches++;
  }
  return Math.min(0.12, (matches / terms.length) * 0.12);
}

export function deduplicateHits<T extends { chunkId: string; documentId: string; content: string; score: number }>(
  hits: T[],
): T[] {
  const seenContent = new Set<string>();
  const seenDoc = new Map<string, number>();
  const result: T[] = [];

  for (const hit of [...hits].sort((a, b) => b.score - a.score)) {
    const contentKey = hit.content.slice(0, 200);
    if (seenContent.has(contentKey)) continue;
    const docCount = seenDoc.get(hit.documentId) ?? 0;
    if (docCount >= 3) continue;
    seenContent.add(contentKey);
    seenDoc.set(hit.documentId, docCount + 1);
    result.push(hit);
  }

  return result;
}

export function applyHybridScores<
  T extends {
    vectorScore: number;
    content: string;
    sourceSection?: string | null;
    topic?: string | null;
    documentType?: string | null;
    hierarchyLevel?: number;
  },
>(rows: T[], queryText: string, hybridEnabled = true): Array<T & { keywordBoost: number; score: number }> {
  const terms = extractQueryTerms(queryText);
  return rows.map((r) => {
    const keywordBoost = hybridEnabled
      ? computeKeywordBoost(r.content, r.sourceSection ?? null, r.topic ?? null, terms)
      : 0;
    const priorityBoost =
      (r.documentType === 'faq' ? 0.03 : 0) + ((r.hierarchyLevel ?? 0) === 1 ? 0.01 : 0);
    const score = Math.min(1, r.vectorScore + keywordBoost + priorityBoost);
    return { ...r, keywordBoost, score };
  });
}
