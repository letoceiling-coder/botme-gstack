import type { WidgetSummary } from './api';

export function widgetNameById(
  widgets: WidgetSummary[],
  widgetId: string,
  unknownLabel: string,
): string {
  return widgets.find((w) => w.id === widgetId)?.name ?? unknownLabel;
}

export function countVisitorsByWidget(
  visitors: { widgetId: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of visitors) {
    counts.set(v.widgetId, (counts.get(v.widgetId) ?? 0) + 1);
  }
  return counts;
}
