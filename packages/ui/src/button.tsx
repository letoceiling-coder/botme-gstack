import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[#39ff14] text-black hover:bg-[#5dff3f] shadow-[0_0_20px_rgba(57,255,20,0.25)]',
  secondary:
    'bg-white/5 text-zinc-100 border border-white/10 hover:bg-white/10 hover:border-white/20',
  ghost: 'bg-transparent text-zinc-300 hover:bg-white/5 hover:text-white',
  danger: 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20',
};

export function Button({
  variant = 'primary',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39ff14]/50',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      )}
      disabled={disabled ?? loading}
      {...props}
    >
      {loading ? 'Загрузка…' : children}
    </button>
  );
}
