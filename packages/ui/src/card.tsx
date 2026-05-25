import type { ReactNode } from 'react';
import { cn } from './tokens';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/8 bg-white/[0.04] p-6 backdrop-blur-xl',
        'shadow-[0_4px_24px_rgba(0,0,0,0.35)]',
        hover && 'transition-all duration-200 hover:border-[#39ff14]/20 hover:bg-white/[0.06]',
        className,
      )}
    >
      {children}
    </div>
  );
}
