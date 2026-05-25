import { memo } from 'react';
import type { WidgetMessageDto } from '@botme/shared';

interface Props {
  message: WidgetMessageDto & { streaming?: boolean };
}

export const WidgetMessageBubble = memo(function WidgetMessageBubble({ message }: Props) {
  const className = `bubble ${message.role === 'USER' ? 'user' : message.author === 'operator' ? 'operator' : 'assistant'} ${message.streaming ? 'bubble--streaming' : ''}`;

  return (
    <div className={className}>
      {message.author === 'operator' && <span className="bubble-label">Оператор</span>}
      {message.content}
      {message.streaming && !message.content && <span className="cursor-blink">▍</span>}
    </div>
  );
});
