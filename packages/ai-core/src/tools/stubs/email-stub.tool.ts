import type { ToolPort } from '../tool-port.js';

export const emailStubTool: ToolPort = {
  type: 'EMAIL_STUB',
  async execute(input) {
    const to = String(input['to'] ?? '').trim();
    const subject = String(input['subject'] ?? '').trim();
    const body = String(input['body'] ?? '').trim();
    if (!to || !subject || !body) {
      return { ok: false, output: '', error: 'to, subject, body required' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { ok: false, output: '', error: 'Invalid email address' };
    }
    const messageId = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      ok: true,
      output: `Email queued (stub): "${subject}" → ${to}`,
      data: { messageId, to, subject, bodyLength: body.length, sent: false },
    };
  },
};
