import type { ChatCompletion, ChatRequest, ProviderToolCall } from '../types.js';

interface OpenAiToolMessage {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export function buildOpenAiChatBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    top_p: request.topP,
    max_tokens: request.maxTokens,
    stream,
  };
  if (request.tools?.length) {
    body.tools = request.tools;
    body.tool_choice = request.toolChoice ?? 'auto';
  }
  return body;
}

export function mapOpenAiChatCompletion(res: {
  id: string;
  model: string;
  choices: Array<{
    message?: OpenAiToolMessage;
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}): ChatCompletion {
  const message = res.choices[0]?.message;
  const toolCalls: ProviderToolCall[] | undefined = message?.tool_calls?.map((tc) => ({
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.function.name,
      arguments: tc.function.arguments,
    },
  }));

  return {
    id: res.id,
    model: res.model,
    content: message?.content ?? '',
    finishReason: res.choices[0]?.finish_reason ?? null,
    usage: {
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0,
    },
    toolCalls,
  };
}
