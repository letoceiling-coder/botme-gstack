const DEFAULT_BASE_URL = 'https://api.neeklo.ru';
const DEFAULT_GOAL =
  'контент для базы знаний: услуги, цены, FAQ, контакты, ключевые факты';

export interface NeekloParserPage {
  url: string;
  finalUrl?: string;
  ok: boolean;
  blocked?: boolean;
  error?: string;
  title?: string;
  textPreview?: string;
  data?: NeekloParserPageData;
}

export interface NeekloParserPageData {
  title?: string;
  summary?: string;
  contacts?: Record<string, string | undefined>;
  prices?: Array<{ name?: string; price?: string; from?: number | string }>;
  services?: string[];
  sections?: Array<{ heading?: string; content?: string }>;
  [key: string]: unknown;
}

export interface NeekloParserUrlsResult {
  mode: 'urls';
  urls: string[];
  pages: NeekloParserPage[];
  answer?: string;
  count?: number;
  durationMs?: number;
}

export interface NeekloParserClientOptions {
  apiKey: string;
  baseUrl?: string;
  pollIntervalMs?: number;
  jobTimeoutMs?: number;
}

export class NeekloParserError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth' | 'unavailable' | 'timeout' | 'failed' | 'invalid',
  ) {
    super(message);
    this.name = 'NeekloParserError';
  }
}

export class NeekloParserClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly pollIntervalMs: number;
  private readonly jobTimeoutMs: number;

  constructor(options: NeekloParserClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.jobTimeoutMs = options.jobTimeoutMs ?? 600_000;
  }

  static fromEnv(): NeekloParserClient | null {
    const apiKey = process.env['NEEKLO_PARSER_API_KEY']?.trim();
    if (!apiKey) return null;
    return new NeekloParserClient({
      apiKey,
      baseUrl: process.env['NEEKLO_PARSER_BASE_URL']?.trim() || DEFAULT_BASE_URL,
    });
  }

  async health(): Promise<{ ok: boolean; cdp?: boolean; modes?: string[] }> {
    const res = await this.request('GET', '/parser/health');
    if (!res.ok) {
      if (res.status === 401) throw new NeekloParserError('Invalid parser API key', 'auth');
      if (res.status === 502) throw new NeekloParserError('Parser backend unavailable', 'unavailable');
      throw new NeekloParserError(`Parser health failed: HTTP ${res.status}`, 'unavailable');
    }
    const body = (await res.json()) as { success?: boolean; cdp?: boolean; modes?: string[] };
    return { ok: body.success === true, cdp: body.cdp, modes: body.modes };
  }

  async parseUrls(urls: string[], goal = DEFAULT_GOAL): Promise<NeekloParserUrlsResult> {
    const normalized = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
    if (normalized.length === 0) {
      throw new NeekloParserError('At least one URL is required', 'invalid');
    }
    if (normalized.length > 20) {
      throw new NeekloParserError('Parser accepts at most 20 URLs per job', 'invalid');
    }

    const createRes = await this.request('POST', '/parser/jobs', {
      mode: 'urls',
      urls: normalized,
      goal,
      includeTextPreview: true,
    });
    if (createRes.status === 401) {
      throw new NeekloParserError('Invalid parser API key', 'auth');
    }
    if (createRes.status === 502) {
      throw new NeekloParserError('Parser backend unavailable', 'unavailable');
    }
    if (!createRes.ok) {
      const errBody = (await createRes.json().catch(() => ({}))) as { error?: string };
      throw new NeekloParserError(errBody.error ?? `Parser job rejected: HTTP ${createRes.status}`, 'invalid');
    }

    const created = (await createRes.json()) as { jobId?: string };
    if (!created.jobId) throw new NeekloParserError('Parser did not return jobId', 'invalid');

    const job = await this.pollJob(created.jobId);
    if (job.status === 'failed') {
      throw new NeekloParserError(job.error ?? 'Parser job failed', 'failed');
    }
    if (!job.result || job.result.mode !== 'urls') {
      throw new NeekloParserError('Parser returned unexpected result shape', 'failed');
    }
    return job.result;
  }

  private async pollJob(jobId: string): Promise<{
    status: string;
    error?: string;
    result?: NeekloParserUrlsResult;
  }> {
    const deadline = Date.now() + this.jobTimeoutMs;
    while (Date.now() < deadline) {
      const res = await this.request('GET', `/parser/jobs/${jobId}`);
      if (res.status === 404) throw new NeekloParserError('Parser job not found', 'failed');
      if (!res.ok) throw new NeekloParserError(`Poll failed: HTTP ${res.status}`, 'unavailable');

      const body = (await res.json()) as {
        job?: { status?: string; error?: string; result?: NeekloParserUrlsResult };
      };
      const status = body.job?.status ?? 'unknown';
      if (status === 'completed') {
        return { status, result: body.job?.result };
      }
      if (status === 'failed') {
        return { status, error: body.job?.error ?? 'Parser job failed' };
      }
      await sleep(this.pollIntervalMs);
    }
    throw new NeekloParserError('Parser job timed out', 'timeout');
  }

  private request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'X-Parser-Key': this.apiKey,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
