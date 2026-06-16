import { describe, expect, it } from 'vitest';
import { jsonToKnowledgeText } from './json-parser.js';

describe('jsonToKnowledgeText', () => {
  it('formats FAQ arrays as markdown sections', () => {
    const data = [
      { question: 'Сколько стоит имплант?', answer: 'От 45 000 ₽' },
      { q: 'Гарантия?', a: '10 лет на имплант' },
    ];
    const { text, documentType } = jsonToKnowledgeText(data);
    expect(documentType).toBe('faq');
    expect(text).toContain('## Сколько стоит имплант?');
    expect(text).toContain('От 45 000 ₽');
    expect(text).toContain('## Гарантия?');
  });

  it('flattens nested objects', () => {
    const { text, documentType } = jsonToKnowledgeText({
      title: 'Прайс',
      services: [{ name: 'Чистка', price: 3000 }],
    });
    expect(documentType).toBe('general');
    expect(text).toContain('Прайс');
    expect(text).toContain('Чистка');
  });
});
