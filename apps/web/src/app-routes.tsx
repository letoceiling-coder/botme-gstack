import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { AuthBootstrapGate, GuestOnly, RequireAuth } from '@/components/auth/auth-guards';
import { LoginPage, RegisterPage } from '@/pages/auth-pages';
import { DashboardPage } from '@/pages/dashboard-page';
import { ToolsPage } from '@/pages/tools-page';
import { ToolDetailPage } from '@/pages/tool-detail-page';
import { WidgetsPage } from '@/pages/widgets-page';
import { OperatorPage } from '@/pages/operator-page';
import { RtcDiagnosticsPage } from '@/pages/rtc-diagnostics-page';
import { LeadsPage } from '@/pages/leads-page';
import { FeatureEmptyPage } from '@/pages/feature-empty-page';
import { KnowledgePage } from '@/pages/knowledge-page';
import { IntegrationsPage } from '@/pages/integrations-page';
import { AgentsPage } from '@/pages/agents-page';
import { AgentPlaygroundPage } from '@/pages/agent-playground-page';
import { AgentEditorPage } from '@/pages/agent-editor-page';
import { AssistantsPage } from '@/pages/assistants-page';
import { AssistantDetailPage } from '@/pages/assistant-detail-page';
import { AssistantRuntimePage } from '@/pages/assistant-runtime-page';
import { AssistantChatPage } from '@/pages/assistant-chat-page';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';
import { connectAdminSocket, disconnectAdminSocket } from '@/lib/socket';

function AdminShell() {
  const session = useAuthStore((s) => s.session);
  const [wsConnected, setWsConnected] = useState(false);
  const workspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) {
      disconnectAdminSocket();
      workspaceIdRef.current = null;
      setWsConnected(false);
      return;
    }

    let cleanup = connectAdminSocket('', () => undefined, setWsConnected);
    workspaceIdRef.current = session.workspace.id;

    const onRefreshed = () => {
      cleanup();
      cleanup = connectAdminSocket('', () => undefined, setWsConnected);
    };
    window.addEventListener('botme:session-refreshed', onRefreshed);

    return () => {
      window.removeEventListener('botme:session-refreshed', onRefreshed);
      cleanup();
    };
  }, [session?.workspace.id]);

  if (!session) return null;
  return <AdminLayout wsConnected={wsConnected} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthBootstrapGate />}>
        <Route path="/" element={<Navigate to="/admin" replace />} />

        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AdminShell />}>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/agents" element={<AgentsPage />} />
            <Route path="/admin/agents/:id" element={<AgentEditorPage />} />
            <Route path="/admin/agents/:id/playground" element={<AgentPlaygroundPage />} />
            <Route path="/admin/assistants" element={<AssistantsPage />} />
            <Route path="/admin/assistants/:id" element={<AssistantDetailPage />} />
            <Route path="/admin/assistants/:id/runtime" element={<AssistantRuntimePage />} />
            <Route path="/admin/assistants/:id/chat" element={<AssistantChatPage />} />
            <Route path="/admin/tools" element={<ToolsPage />} />
            <Route path="/admin/tools/:id" element={<ToolDetailPage />} />
            <Route path="/admin/knowledge" element={<KnowledgePage />} />
            <Route path="/admin/integrations" element={<IntegrationsPage />} />
            <Route path="/admin/leads" element={<LeadsPage />} />
            <Route path="/admin/widgets" element={<WidgetsPage />} />
            <Route path="/admin/operator" element={<OperatorPage />} />
            <Route path="/admin/rtc-diagnostics" element={<RtcDiagnosticsPage />} />
            <Route
              path="/admin/settings"
              element={
                <FeatureEmptyPage
                  title={ru.nav.settings}
                  description={ru.empty.settings.description}
                />
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
