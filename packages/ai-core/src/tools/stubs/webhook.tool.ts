import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { ToolPort } from '../tool-port.js';

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const MAX_BODY_BYTES = 32_768;

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

function validateExternalUrl(urlRaw: string): URL | { error: string } {
  try {
    const url = new URL(urlRaw);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { error: 'Protocol not allowed' };
    }
    if (isPrivateIp(url.hostname)) {
      return { error: 'Private or local addresses blocked' };
    }
    return url;
  } catch {
    return { error: 'Invalid URL' };
  }
}

export const webhookTool: ToolPort = {
  type: 'WEBHOOK',
  async execute(input) {
    const urlRaw = String(input['url'] ?? '').trim();
    const payload = input['payload'] ?? {};
    const secret = String(input['secret'] ?? '').trim();
    const validated = validateExternalUrl(urlRaw);
    if ('error' in validated) {
      return { ok: false, output: '', error: validated.error };
    }

    const body = JSON.stringify(payload);
    if (body.length > MAX_BODY_BYTES) {
      return { ok: false, output: '', error: 'Payload too large' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain',
    };
    if (secret) {
      const signature = createHmac('sha256', secret).update(body).digest('hex');
      headers['X-Botme-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(validated.toString(), {
        method: 'POST',
        signal: controller.signal,
        headers,
        body,
      });
      const text = await res.text();
      return {
        ok: res.ok,
        output: text.slice(0, 16_000),
        data: { status: res.status, signed: Boolean(secret) },
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err: unknown) {
      return { ok: false, output: '', error: err instanceof Error ? err.message : 'Webhook failed' };
    } finally {
      clearTimeout(timer);
    }
  },
};
