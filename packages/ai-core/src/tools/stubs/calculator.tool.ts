import type { ToolPort } from '../tool-port.js';

export const calculatorTool: ToolPort = {
  type: 'CALCULATOR',
  async execute(input) {
    const expression = String(input['expression'] ?? '').trim();
    if (!expression || !/^[\d\s+\-*/().]+$/.test(expression)) {
      return { ok: false, output: '', error: 'Invalid expression' };
    }
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${expression})`)();
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, output: '', error: 'Invalid result' };
      }
      return { ok: true, output: String(value), data: { value } };
    } catch {
      return { ok: false, output: '', error: 'Evaluation failed' };
    }
  },
};
