import type { ToolPort } from './tool-port.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolPort>();

  register(tool: ToolPort): void {
    this.tools.set(tool.type, tool);
  }

  get(type: string): ToolPort | undefined {
    return this.tools.get(type);
  }

  list(): ToolPort[] {
    return [...this.tools.values()];
  }
}

export const toolRegistry = new ToolRegistry();
