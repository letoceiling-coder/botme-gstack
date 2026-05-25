export interface ParsedDocument {
  text: string;
  pages?: string[];
  metadata: ParseMetadata;
}

export interface ParseMetadata {
  title?: string;
  pageCount?: number;
  encoding?: string;
  wordCount?: number;
  sourceFormat: string;
}

export interface DocumentParser {
  readonly mimeTypes: readonly string[];
  parse(buffer: Buffer, filename: string): Promise<ParsedDocument>;
}

export class ParserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ParserError';
  }
}
