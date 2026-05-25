import { Card } from '@botme/ui';

export function OperatorPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Operator Panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live visitors, takeover, voice/video controls — isolated runtime.
        </p>
      </div>
      <Card className="overflow-hidden p-0">
        <iframe
          title="Operator panel"
          src="/operator-panel/"
          className="h-[min(80vh,900px)] w-full border-0 bg-background"
          allow="microphone *; camera *; autoplay *; fullscreen *; display-capture *"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </Card>
    </div>
  );
}
