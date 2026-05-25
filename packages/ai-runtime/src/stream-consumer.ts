import type { StreamRuntime } from './stream-runtime.js';

export interface StreamChunkResult<TDone> {
  done: false;
  delta: string;
}

export interface StreamDoneResult<TDone> {
  done: true;
  value: TDone;
}

export type StreamIteratorResult<TDone> = StreamChunkResult<TDone> | StreamDoneResult<TDone>;

/**
 * Consumes an async generator through StreamRuntime — handles reset between models.
 */
export async function consumeStream<TDone>(
  runtime: StreamRuntime,
  generator: AsyncGenerator<{ delta: string }, TDone, undefined>,
  extractContent: (done: TDone) => string,
  extractMeta?: (done: TDone) => { provider?: string; modelId?: string },
): Promise<TDone> {
  let result = await generator.next();
  while (!result.done) {
    runtime.pushChunk(result.value.delta ?? '');
    result = await generator.next();
  }
  runtime.complete(extractContent(result.value), extractMeta?.(result.value));
  return result.value;
}
