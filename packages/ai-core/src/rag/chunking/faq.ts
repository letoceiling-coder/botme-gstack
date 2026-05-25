export interface FaqPair {
  question: string;
  answer: string;
}

const FAQ_PATTERNS = [
  /^(?:Q|Вопрос)[:\s]+(.+)\n+(?:A|Ответ)[:\s]+([\s\S]+)/gim,
  /^#{1,3}\s*(.+?\?)\s*\n+([\s\S]+?)(?=^#{1,3}\s|\Z)/gm,
  /^\*\*(.+?\?)\*\*\s*\n+([\s\S]+?)(?=^\*\*|\Z)/gm,
];

export function extractFaqPairs(text: string): FaqPair[] {
  const pairs: FaqPair[] = [];

  for (const pattern of FAQ_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const question = match[1]?.trim();
      const answer = match[2]?.trim();
      if (question && answer && answer.length > 10) {
        pairs.push({ question, answer });
      }
    }
    if (pairs.length > 0) break;
  }

  return pairs;
}

export function isLikelyFaqDocument(text: string): boolean {
  if (extractFaqPairs(text).length >= 2) return true;
  const qCount = (text.match(/\?\s*\n/g) ?? []).length;
  return qCount >= 3 && text.includes('?');
}
