import { describe, expect, it } from 'vitest';
import { pageTextFromParserPage, parserUrlsResultToCrawlPages } from './neeklo-parser-to-kb.js';

describe('parserUrlsResultToCrawlPages', () => {
  it('maps structured dental page to markdown text', () => {
    const pages = parserUrlsResultToCrawlPages({
      mode: 'urls',
      urls: ['https://demo.neeklo.ru/'],
      pages: [
        {
          url: 'https://demo.neeklo.ru/',
          ok: true,
          title: 'Neeklo Dental',
          data: {
            summary: 'Премиальная стоматология',
            services: ['Имплантация', 'Виниры'],
            prices: [{ name: 'Консультация', price: '0 ₽' }],
            contacts: { phone: '+7 495 123-45-67', address: 'Москва' },
            sections: [{ heading: 'FAQ', content: 'Больно ли? — Нет, под анестезией.' }],
          },
        },
      ],
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toContain('Премиальная стоматология');
    expect(pages[0]?.text).toContain('## Услуги');
    expect(pages[0]?.text).toContain('Имплантация');
    expect(pages[0]?.text).toContain('## FAQ');
  });

  it('falls back to answer when all pages failed', () => {
    const pages = parserUrlsResultToCrawlPages({
      mode: 'urls',
      urls: ['https://example.com/'],
      answer: 'Сводный ответ парсера',
      pages: [{ url: 'https://example.com/', ok: false, error: 'timeout' }],
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toBe('Сводный ответ парсера');
  });

  it('uses textPreview when data is empty', () => {
    const text = pageTextFromParserPage({
      url: 'https://example.com/',
      ok: true,
      textPreview: 'Plain preview text from page',
    });
    expect(text).toBe('Plain preview text from page');
  });
});
