import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronRight, Loader2, Wrench, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ToolDto } from '@botme/shared';
import { Badge, Card } from '@botme/ui';
import { api } from '@/lib/api';

function statusBadge(tool: ToolDto) {
  if (!tool.enabled) return <Badge variant="muted">Отключён</Badge>;
  if (tool.lastStatus === 'FAILED' || tool.lastStatus === 'TIMEOUT') {
    return <Badge variant="warning">Ошибки</Badge>;
  }
  return <Badge variant="success">Активен</Badge>;
}

export function ToolsPage() {
  const toolsQuery = useQuery({ queryKey: ['tools'], queryFn: () => api.tools.list() });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Инструменты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Runtime tools для ассистентов: выполнение, логи, тестирование.
        </p>
      </div>

      {toolsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(toolsQuery.data ?? []).map((tool, i) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link to={`/admin/tools/${tool.id}`}>
                <Card className="group h-full p-5 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Wrench className="h-5 w-5 text-primary" />
                    </div>
                    {statusBadge(tool)}
                  </div>
                  <h3 className="mt-4 font-medium">{tool.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="muted">{tool.category}</Badge>
                    <Badge variant="muted">{tool.type}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5" />
                      {tool.executionCount} запусков
                    </span>
                    <span>{tool.avgLatencyMs != null ? `${tool.avgLatencyMs} ms` : '—'}</span>
                    <ChevronRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
