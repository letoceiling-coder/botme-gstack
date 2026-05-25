import type { AgentOrchestratorConfig, OrchestratorMessage } from '../orchestrator/chat-orchestrator.js';
import { buildChatMessages, chatOrchestrator } from '../orchestrator/chat-orchestrator.js';
import { aiProviderFactory } from '../factory.js';
import type { BoundToolInfo, ToolContext, ToolResult } from './tool-port.js';
import { toolExecutor } from './tool-executor.js';
import {
  resolveToolCallFromCompletion,
  resolveToolCallingStrategy,
  withNativeTools,
} from './provider-tool-call.js';
import { buildToolSystemAppendix, parseToolCall } from './tool-loop.helpers.js';

export type { ParsedToolCall } from './tool-loop.helpers.js';
export { buildToolSystemAppendix, parseToolCall } from './tool-loop.helpers.js';

export interface ToolStepResult {
  usedTool: boolean;
  toolType?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: ToolResult;
  probeContent: string;
}

export async function probeToolCall(
  config: AgentOrchestratorConfig,
  history: OrchestratorMessage[],
  userMessage: string,
  tools: BoundToolInfo[],
  signal?: AbortSignal,
): Promise<ToolStepResult> {
  if (tools.length === 0) {
    return { usedTool: false, probeContent: '' };
  }

  const adapter = aiProviderFactory.create(config.provider, {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  const strategy = resolveToolCallingStrategy(config.provider, tools);
  const baseMessages = buildChatMessages(
    strategy === 'native'
      ? config.systemPrompt
      : config.systemPrompt + buildToolSystemAppendix(tools),
    [...history, { role: 'user', content: userMessage }],
  );

  let completion;
  try {
    completion = await adapter.chat(
      withNativeTools(
        {
          model: config.modelId,
          messages: baseMessages,
          temperature: Math.min(config.temperature, strategy === 'native' ? config.temperature : 0.3),
          topP: config.topP,
          maxTokens: Math.min(config.maxTokens, strategy === 'native' ? config.maxTokens : 1024),
          stream: false,
          signal,
        },
        strategy === 'native' ? tools : [],
      ),
    );
  } catch {
    if (strategy !== 'native') throw new Error('Tool probe failed');
    completion = await adapter.chat({
      model: config.modelId,
      messages: buildChatMessages(config.systemPrompt + buildToolSystemAppendix(tools), [
        ...history,
        { role: 'user', content: userMessage },
      ]),
      temperature: 0.2,
      topP: config.topP,
      maxTokens: 1024,
      stream: false,
      signal,
    });
  }

  const { call, content } = resolveToolCallFromCompletion(completion, tools);
  if (!call) {
    return { usedTool: false, probeContent: content };
  }

  return {
    usedTool: true,
    toolType: call.type,
    toolInput: call.input,
    probeContent: content,
  };
}

export async function executeBoundTool(
  type: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  return toolExecutor.execute(type, input, ctx);
}

export interface StreamWithToolLoopParams {
  config: AgentOrchestratorConfig;
  history: OrchestratorMessage[];
  userMessage: string;
  tools: BoundToolInfo[];
  toolContext: ToolContext;
  signal?: AbortSignal;
}

export async function* streamWithSingleToolStep(
  params: StreamWithToolLoopParams,
): AsyncGenerator<{ delta: string }, { content: string; toolUsed: boolean; toolType?: string; toolResult?: ToolResult }, undefined> {
  const { config, history, userMessage, tools, toolContext, signal } = params;

  if (tools.length === 0) {
    const gen = chatOrchestrator.streamCompletion(config, history, userMessage, signal);
    let result = await gen.next();
    while (!result.done) {
      if (result.value.delta) yield { delta: result.value.delta };
      result = await gen.next();
    }
    return { content: result.value.content, toolUsed: false };
  }

  const probe = await probeToolCall(config, history, userMessage, tools, signal);

  if (probe.usedTool && probe.toolType && probe.toolInput) {
    const toolResult = await executeBoundTool(probe.toolType, probe.toolInput, toolContext);
    const followUpConfig: AgentOrchestratorConfig = {
      ...config,
      systemPrompt: `${config.systemPrompt}\n\n[Tool ${probe.toolType} result]: ${toolResult.ok ? toolResult.output : toolResult.error ?? 'failed'}`,
    };
    const gen = chatOrchestrator.streamCompletion(followUpConfig, history, userMessage, signal);
    let result = await gen.next();
    while (!result.done) {
      if (result.value.delta) yield { delta: result.value.delta };
      result = await gen.next();
    }
    return {
      content: result.value.content,
      toolUsed: true,
      toolType: probe.toolType,
      toolResult,
    };
  }

  if (probe.probeContent) {
    yield { delta: probe.probeContent };
    return { content: probe.probeContent, toolUsed: false };
  }

  const gen = chatOrchestrator.streamCompletion(config, history, userMessage, signal);
  let result = await gen.next();
  while (!result.done) {
    if (result.value.delta) yield { delta: result.value.delta };
    result = await gen.next();
  }
  return { content: result.value.content, toolUsed: false };
}
