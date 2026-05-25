/** Redis pub/sub channel naming for horizontal scale. */
export const REDIS_CHANNELS = {
  workspace: (workspaceId: string) => `botme:workspace:${workspaceId}`,
  operator: (workspaceId: string) => `botme:operator:${workspaceId}`,
  widget: (widgetId: string) => `botme:widget:${widgetId}`,
  call: (callId: string) => `botme:call:${callId}`,
} as const;

export type RedisChannelKey = keyof typeof REDIS_CHANNELS;
