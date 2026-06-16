export * from './types.js';
export * from './normalize.js';
export * from './registry.js';
export * from './builtin-parsers.js';

import { parserRegistry } from './registry.js';
import { CsvParser, HtmlParser, MarkdownParser, PlainTextParser } from './builtin-parsers.js';
import { JsonParser } from './json-parser.js';

let initialized = false;

export function ensureParserRegistry(): void {
  if (initialized) return;
  parserRegistry.register(new PlainTextParser());
  parserRegistry.register(new MarkdownParser());
  parserRegistry.register(new HtmlParser());
  parserRegistry.register(new CsvParser());
  parserRegistry.register(new JsonParser());
  initialized = true;
}

export { parserRegistry };
