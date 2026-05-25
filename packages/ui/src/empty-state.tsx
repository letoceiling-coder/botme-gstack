import type { ReactNode } from 'react';
import { cn } from './tokens';

interface EmptyStateProps {
  title: string;
  description: string;
  phase?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, phase, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10',
        'bg-white/[0.02] px-6 py-12 text-center',
        className,
      )}
    >
      {phase ? (
        <span className="mb-4 rounded-full border border-[#39ff14]/30 bg-[#39ff14]/10 px-3 py-1 text-xs font-medium text-[#39ff14]">
          {phase}
        </span>
      ) : null}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
