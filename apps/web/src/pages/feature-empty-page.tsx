import { EmptyState } from '@botme/ui';

interface FeatureEmptyPageProps {
  title: string;
  description: string;
  phase?: string;
}

export function FeatureEmptyPage({ title, description, phase }: FeatureEmptyPageProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      <EmptyState title="Скоро" description={description} phase={phase} />
    </div>
  );
}
