import type { InputHTMLAttributes } from 'react';
import { cn } from './tokens';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-zinc-300">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={cn(
          'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white',
          'placeholder:text-zinc-500',
          'transition-colors duration-200',
          'focus:border-[#39ff14]/50 focus:outline-none focus:ring-2 focus:ring-[#39ff14]/20',
          error && 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20',
          className,
        )}
        {...props}
      />
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
