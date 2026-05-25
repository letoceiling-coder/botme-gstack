import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '@botme/ui';

interface CopyCardProps {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  prominent?: boolean;
}

export function CopyCard({ label, value, hint, mono = true, prominent = false }: CopyCardProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (prominent) {
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-muted/10 to-transparent p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium text-primary">Готово к использованию — вставьте перед &lt;/body&gt;</p>
          </div>
          <Button className="min-w-[160px]" onClick={() => void copy()}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Скопировано!' : 'Копировать код'}
          </Button>
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-background/80 p-3 text-xs leading-relaxed">
          {value}
        </pre>
        {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      </Card>
    );
  }

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
