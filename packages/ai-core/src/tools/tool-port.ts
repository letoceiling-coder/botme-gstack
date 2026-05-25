export interface ToolContext {
  workspaceId: string;
  conversationId?: string;
  visitorId?: string;
  assistantId?: string;
  knowledgeBaseIds?: string[];
  ragRetrieve?: (query: string) => Promise<{ output: string; citations?: unknown[] }>;
  persistLead?: (data: {
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }) => Promise<{ id: string }>;
  memoryStore?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  persistCrmNote?: (content: string) => Promise<{ id: string }>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ToolDefinition {
  type: string;
  name: string;
  description: string;
  schema?: Record<string, unknown>;
}

export interface ToolPort {
  readonly type: string;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface BoundToolInfo {
  id: string;
  name: string;
  description: string;
  type: string;
  schema?: Record<string, unknown>;
}
