import type { ReactNode } from 'react';
import { cn, tokens } from './tokens';

type BadgeVariant = 'free' | 'default' | 'success' | 'warning' | 'muted';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  free: 'bg-[#39ff14]/20 text-[#39ff14] border-[#39ff14]/40 shadow-[0_0_12px_rgba(57,255,20,0.25)]',
  default: 'bg-white/5 text-zinc-200 border-white/10',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  muted: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
      style={{ fontFamily: 'inherit' }}
    >
      {children}
    </span>
  );
}
