import { isIP } from 'node:net';
import type { ToolPort } from '../tool-port.js';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const ALLOWED_METHODS = new Set(['GET', 'POST']);
const MAX_RESPONSE_BYTES = 65_536;

function isPrivateIp(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) return true;
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const parts = hostname.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
  }
  if (ipVersion === 6) {
    const lower = hostname.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  }
  return false;
}

export const httpTool: ToolPort = {
  type: 'HTTP_REQUEST',
  async execute(input) {
    const urlRaw = String(input['url'] ?? '').trim();
    const method = String(input['method'] ?? 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      return { ok: false, output: '', error: 'Method not allowed' };
    }

    let url: URL;
    try {
      url = new URL(urlRaw);
    } catch {
      return { ok: false, output: '', error: 'Invalid URL' };
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, output: '', error: 'Protocol not allowed' };
    }

    if (isPrivateIp(url.hostname)) {
      return { ok: false, output: '', error: 'Private or local addresses blocked' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url.toString(), {
        method,
        signal: controller.signal,
        headers: { Accept: 'application/json, text/plain' },
        body: method === 'POST' ? JSON.stringify(input['body'] ?? {}) : undefined,
      });

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_RESPONSE_BYTES) {
        return { ok: false, output: '', error: 'Response too large' };
      }

      const text = new TextDecoder().decode(buf);
      return {
        ok: res.ok,
        output: text.slice(0, MAX_RESPONSE_BYTES),
        data: { status: res.status },
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Request failed';
      return { ok: false, output: '', error: message };
    } finally {
      clearTimeout(timer);
    }
  },
};
