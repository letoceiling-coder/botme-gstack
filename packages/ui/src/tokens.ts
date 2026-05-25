export const tokens = {
  colors: {
    bgBase: '#0a0a0b',
    bgElevated: '#111113',
    bgGlass: 'rgba(255,255,255,0.04)',
    borderGlass: 'rgba(255,255,255,0.08)',
    accent: '#39ff14',
    accentMuted: 'rgba(57,255,20,0.15)',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    danger: '#ef4444',
  },
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
  },
  shadow: {
    glow: '0 0 24px rgba(57,255,20,0.25)',
    card: '0 4px 24px rgba(0,0,0,0.4)',
  },
} as const;

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
