import type { HealthStatus } from '@botme/shared';
import { Badge } from '@botme/ui';

const LABELS: Record<HealthStatus, string> = {
  online: 'ONLINE',
  degraded: 'DEGRADED',
  offline: 'OFFLINE',
};

const VARIANTS: Record<HealthStatus, 'success' | 'warning' | 'muted'> = {
  online: 'success',
  degraded: 'warning',
  offline: 'muted',
};

interface HealthStatusChipProps {
  status: HealthStatus;
  label?: string;
  pulse?: boolean;
}

export function HealthStatusChip({ status, label, pulse = true }: HealthStatusChipProps) {
  return (
    <Badge variant={VARIANTS[status]} className="gap-1.5">
      {pulse && (
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status === 'online'
              ? 'bg-emerald-400 animate-pulse'
              : status === 'degraded'
                ? 'bg-amber-400'
                : 'bg-red-400'
          }`}
        />
      )}
      {label ?? LABELS[status]}
    </Badge>
  );
}
