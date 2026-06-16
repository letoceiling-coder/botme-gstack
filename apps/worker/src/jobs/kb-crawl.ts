import {
  assertSafeFetchUrl,
  canonicalizeUrl,
  normalizeExtractedText,
  stripHtmlFromCrawl,
} from './kb-crawl-utils.js';

export interface CrawlConfig {
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  respectRobots: boolean;
}

export interface CrawlPageResult {
  url: string;
  title: string;
  text: string;
}

export async function crawlWebsite(config: CrawlConfig): Promise<CrawlPageResult[]> {
  const start = await assertSafeFetchUrl(config.startUrl);
  const origin = start.origin;
  const visited = new Set<string>();
  const results: CrawlPageResult[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: canonicalizeUrl(start.toString()), depth: 0 }];

  let robotsDisallow: string[] = [];
  if (config.respectRobots) {
    robotsDisallow = await fetchRobotsDisallow(origin);
  }

  while (queue.length > 0 && results.length < config.maxPages) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;
    if (next.depth > config.maxDepth) continue;
    if (!matchesPatterns(next.url, config.includePatterns, config.excludePatterns)) continue;
    if (config.respectRobots && isRobotsBlocked(next.url, robotsDisallow)) continue;

    visited.add(next.url);

    try {
      const page = await fetchPage(next.url);
      if (!page.text.trim()) continue;

      results.push({ url: next.url, title: page.title, text: page.text });

      if (next.depth < config.maxDepth) {
        for (const link of page.links) {
          if (visited.has(link) || results.length + queue.length >= config.maxPages * 3) continue;
          if (!link.startsWith(origin)) continue;
          queue.push({ url: link, depth: next.depth + 1 });
        }
      }
    } catch {
      /* skip failed pages */
    }
  }

  return results;
}

async function fetchPage(url: string): Promise<{ title: string; text: string; links: string[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Botme-KB-Crawler/1.0', Accept: 'text/html' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) throw new Error('Not HTML');

    const html = await res.text();
    if (html.length > 2_000_000) throw new Error('Page too large');

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const text = normalizeExtractedText(stripHtmlFromCrawl(html));
    const links = extractLinks(html, url);
    return { title: titleMatch?.[1]?.trim() ?? url, text, links };
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const re = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const href = match[1];
      if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
      const abs = new URL(href, baseUrl);
      if (abs.protocol === 'http:' || abs.protocol === 'https:') {
        links.add(canonicalizeUrl(abs.toString()));
      }
    } catch {
      /* ignore bad URLs */
    }
  }
  return [...links];
}

function matchesPatterns(
  url: string,
  include?: string[],
  exclude?: string[],
): boolean {
  if (exclude?.some((p) => url.includes(p))) return false;
  if (include && include.length > 0) {
    return include.some((p) => url.includes(p));
  }
  return true;
}

async function fetchRobotsDisallow(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split('\n')
      .filter((line) => line.toLowerCase().startsWith('disallow:'))
      .map((line) => line.split(':')[1]?.trim() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isRobotsBlocked(url: string, disallow: string[]): boolean {
  const path = new URL(url).pathname;
  return disallow.some((rule) => rule === '/' || path.startsWith(rule));
}

/** Collect same-origin URLs for batch parser jobs (max 20). */
export async function discoverCrawlUrls(config: CrawlConfig, limit = 20): Promise<string[]> {
  const start = await assertSafeFetchUrl(config.startUrl);
  const origin = start.origin;
  const visited = new Set<string>();
  const urls: string[] = [];
  const queue: Array<{ url: string; depth: number }> = [
    { url: canonicalizeUrl(start.toString()), depth: 0 },
  ];

  let robotsDisallow: string[] = [];
  if (config.respectRobots) {
    robotsDisallow = await fetchRobotsDisallow(origin);
  }

  const cap = Math.min(limit, 20, config.maxPages);

  while (queue.length > 0 && urls.length < cap) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;
    if (next.depth > config.maxDepth) continue;
    if (!matchesPatterns(next.url, config.includePatterns, config.excludePatterns)) continue;
    if (config.respectRobots && isRobotsBlocked(next.url, robotsDisallow)) continue;

    visited.add(next.url);
    urls.push(next.url);

    if (next.depth < config.maxDepth) {
      try {
        const page = await fetchPage(next.url);
        for (const link of page.links) {
          if (visited.has(link)) continue;
          if (!link.startsWith(origin)) continue;
          if (urls.length + queue.length >= cap * 3) continue;
          queue.push({ url: link, depth: next.depth + 1 });
        }
      } catch {
        /* skip link discovery errors */
      }
    }
  }

  return urls;
}
