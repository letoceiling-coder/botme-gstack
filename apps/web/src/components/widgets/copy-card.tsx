import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '@botme/ui';

interface CopyCardProps {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}

export function CopyCard({ label, value, hint, mono = true }: CopyCardProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-border/60 bg-gradient-to-br from-muted/20 to-transparent p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void copy()}>
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </Button>
      </div>
      <p className={`break-all text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
