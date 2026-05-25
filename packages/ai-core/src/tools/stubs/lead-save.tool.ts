import type { ToolPort } from '../tool-port.js';

export const leadSaveTool: ToolPort = {
  type: 'LEAD_SAVER',
  async execute(input, ctx) {
    const email = String(input['email'] ?? '').trim();
    const name = String(input['name'] ?? '').trim();
    const phone = String(input['phone'] ?? '').trim();
    const notes = String(input['notes'] ?? '').trim();
    if (!email && !phone) {
      return { ok: false, output: '', error: 'email or phone required' };
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, output: '', error: 'Invalid email' };
    }
    if (!ctx.persistLead) {
      return { ok: false, output: '', error: 'Lead persistence not available' };
    }
    const saved = await ctx.persistLead({ name: name || undefined, email: email || undefined, phone: phone || undefined, notes: notes || undefined });
    return {
      ok: true,
      output: 'Lead saved successfully',
      data: { leadId: saved.id, name, email, phone },
    };
  },
};
