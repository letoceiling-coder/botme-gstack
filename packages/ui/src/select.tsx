import type { OptionHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from './tokens';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

/** Dark-theme native select — `color-scheme: dark` fixes invisible option text in Chrome. */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border border-white/10 bg-[#1a1a1d] px-3 py-2.5 text-sm text-white',
        'transition-colors duration-200',
        'focus:border-[#39ff14]/50 focus:outline-none focus:ring-2 focus:ring-[#39ff14]/20',
        '[color-scheme:dark]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function SelectOption({ className, ...props }: OptionHTMLAttributes<HTMLOptionElement>) {
  return <option className={cn('bg-[#111113] text-white', className)} {...props} />;
}
