import { estimateTokens } from './chunker.js';

export interface BudgetItem {
  key: string;
  text: string;
  priority: number;
  droppable: boolean;
}

export interface BudgetResult {
  included: BudgetItem[];
  dropped: BudgetItem[];
  totalTokens: number;
}

export function allocateContextBudget(items: BudgetItem[], maxTokens: number): BudgetResult {
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  const included: BudgetItem[] = [];
  const dropped: BudgetItem[] = [];
  let used = 0;

  for (const item of sorted) {
    const tokens = estimateTokens(item.text);
    if (used + tokens <= maxTokens) {
      included.push(item);
      used += tokens;
      continue;
    }

    if (!item.droppable) {
      const remaining = maxTokens - used;
      if (remaining > 50) {
        const ratio = remaining / tokens;
        const trimmed = item.text.slice(0, Math.floor(item.text.length * ratio));
        included.push({ ...item, text: trimmed });
        used = maxTokens;
      } else {
        dropped.push(item);
      }
      continue;
    }

    dropped.push(item);
  }

  return { included, dropped, totalTokens: used };
}

export function buildRagContextBlock(chunks: Array<{ citation: string; content: string }>, maxTokens: number): string {
  const items: BudgetItem[] = chunks.map((chunk, index) => ({
    key: `chunk-${index}`,
    text: `<retrieved_context citation="${chunk.citation}">\n${chunk.content}\n</retrieved_context>`,
    priority: 3 + index * 0.001,
    droppable: true,
  }));

  const { included } = allocateContextBudget(items, maxTokens);
  return included.map((i) => i.text).join('\n\n');
}
