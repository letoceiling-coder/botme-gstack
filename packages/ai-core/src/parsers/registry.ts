import type { DocumentParser } from './types.js';
import { ParserError } from './types.js';

class ParserRegistry {
  private readonly byMime = new Map<string, DocumentParser>();

  register(parser: DocumentParser): void {
    for (const mime of parser.mimeTypes) {
      this.byMime.set(mime, parser);
    }
  }

  get(mimeType: string): DocumentParser | undefined {
    return this.byMime.get(mimeType);
  }

  async parse(mimeType: string, buffer: Buffer, filename: string) {
    const parser = this.get(mimeType);
    if (!parser) {
      throw new ParserError(`Неподдерживаемый формат: ${mimeType}`, 'UNSUPPORTED_MIME');
    }
    try {
      return await parser.parse(buffer, filename);
    } catch (err: unknown) {
      if (err instanceof ParserError) throw err;
      const message = err instanceof Error ? err.message : 'Ошибка парсинга';
      throw new ParserError(message, 'PARSE_FAILED');
    }
  }
}

export const parserRegistry = new ParserRegistry();

export function registerBuiltinParsers(): void {
  // Lazy registration from builtin-parsers to avoid circular imports
}
