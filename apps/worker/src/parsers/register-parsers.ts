import {
  ensureParserRegistry,
  normalizeExtractedText,
  parserRegistry,
  type DocumentParser,
  type ParsedDocument,
} from '@botme/ai-core';

class PdfParser implements DocumentParser {
  readonly mimeTypes = ['application/pdf'] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    const pages: string[] = [];
    if (typeof parsed.text === 'string') {
      const byFormFeed = parsed.text.split('\f').map((p) => p.trim()).filter(Boolean);
      if (byFormFeed.length > 1) {
        pages.push(...byFormFeed);
      }
    }
    const text = normalizeExtractedText(parsed.text ?? '');
    if (!text) throw new Error('PDF не содержит извлекаемого текста');
    return {
      text,
      pages: pages.length > 0 ? pages : undefined,
      metadata: {
        sourceFormat: 'application/pdf',
        title: filename,
        pageCount: parsed.numpages,
        wordCount: text.split(/\s+/).length,
      },
    };
  }
}

class DocxParser implements DocumentParser {
  readonly mimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = normalizeExtractedText(result.value ?? '');
    if (!text) throw new Error('DOCX не содержит текста');
    return {
      text,
      metadata: { sourceFormat: 'docx', title: filename, wordCount: text.split(/\s+/).length },
    };
  }
}

class XlsxParser implements DocumentParser {
  readonly mimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ] as const;

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocument> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        parts.push(`## ${sheetName}\n${csv}`);
      }
    }
    const text = normalizeExtractedText(parts.join('\n\n'));
    if (!text) throw new Error('XLSX пуст');
    return {
      text,
      metadata: { sourceFormat: 'xlsx', title: filename, wordCount: text.split(/\s+/).length },
    };
  }
}

export function registerWorkerParsers(): void {
  ensureParserRegistry();
  parserRegistry.register(new PdfParser());
  parserRegistry.register(new DocxParser());
  parserRegistry.register(new XlsxParser());
}
