import { ToolRegistry, toolRegistry } from './tool-registry.js';
import { ToolSandbox, toolSandbox } from './tool-sandbox.js';
import type { ToolContext, ToolResult } from './tool-port.js';

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry = toolRegistry,
    private readonly sandbox: ToolSandbox = toolSandbox,
  ) {}

  async execute(
    type: string,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.registry.get(type);
    if (!tool) {
      return { ok: false, output: '', error: `Unknown tool: ${type}` };
    }
    return this.sandbox.run(tool, input, ctx);
  }
}

export const toolExecutor = new ToolExecutor();
