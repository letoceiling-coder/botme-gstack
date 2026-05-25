import type { ToolPort, ToolResult } from './tool-port.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_CHARS = 16_000;

export class ToolSandbox {
  async run(
    tool: ToolPort,
    input: Record<string, unknown>,
    ctx: Parameters<ToolPort['execute']>[1],
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<ToolResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        tool.execute(input, ctx),
        new Promise<ToolResult>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Tool timeout')));
        }),
      ]);

      if (result.output.length > MAX_OUTPUT_CHARS) {
        return {
          ok: false,
          output: '',
          error: 'Tool output exceeds size limit',
        };
      }

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tool execution failed';
      return { ok: false, output: '', error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const toolSandbox = new ToolSandbox();
