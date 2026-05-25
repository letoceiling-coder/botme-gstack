import { ProviderRequestError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signals = [controller.signal];
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let providerCode: string | undefined;
        try {
          const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
          providerCode = parsed.error?.code;
        } catch {
          /* ignore */
        }
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < maxRetries) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
        throw new ProviderRequestError(
          `HTTP ${res.status}`,
          res.status,
          providerCode,
        );
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      lastError = err;
      if (err instanceof ProviderRequestError) {
        throw err;
      }
      if (attempt < maxRetries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

export async function* fetchSSE(
  url: string,
  options: FetchJsonOptions,
): AsyncIterable<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 60_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetchImpl(url, {
      method: options.method ?? 'POST',
      headers: { ...options.headers, Accept: 'text/event-stream' },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new ProviderRequestError(`HTTP ${res.status}`, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data !== '[DONE]') yield data;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
