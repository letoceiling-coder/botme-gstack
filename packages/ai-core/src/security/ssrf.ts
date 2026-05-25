import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal']);

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (!ip.includes('.')) return false;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function normalizeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Разрешены только HTTP(S) URL');
  }
  if (url.username || url.password) {
    throw new Error('URL с credentials запрещён');
  }
  return url;
}

export async function assertSafeFetchUrl(raw: string): Promise<URL> {
  const url = normalizeUrl(raw);
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error('Запрещённый хост');
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private IP запрещён');
    return url;
  }
  const records = await lookup(host, { all: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error('URL резолвится в private IP');
    }
  }
  return url;
}

export function canonicalizeUrl(raw: string): string {
  const url = normalizeUrl(raw);
  url.hash = '';
  if (url.pathname.endsWith('/') && url.pathname.length > 1) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
