import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bot,
  BookOpen,
  LayoutDashboard,
  LogOut,
  Headphones,
  Menu,
  MessageSquare,
  Plug,
  Radio,
  Settings,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { FEATURES } from '@botme/shared';
import { Button } from '@botme/ui';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

const navItems = [
  { to: '/admin', label: ru.nav.dashboard, icon: LayoutDashboard, feature: 'dashboard' as const, end: true },
  { to: '/admin/agents', label: ru.nav.agents, icon: Bot, feature: 'agents' as const },
  { to: '/admin/assistants', label: ru.nav.assistants, icon: MessageSquare, feature: 'assistants' as const },
  { to: '/admin/tools', label: ru.nav.tools, icon: Wrench, feature: 'tools' as const },
  { to: '/admin/knowledge', label: ru.nav.knowledge, icon: BookOpen, feature: 'knowledge' as const },
  { to: '/admin/integrations', label: ru.nav.integrations, icon: Plug, feature: 'integrations' as const },
  { to: '/admin/leads', label: ru.nav.leads, icon: Users, feature: 'leads' as const },
  { to: '/admin/widgets', label: ru.nav.widgets, icon: Zap, feature: 'widgets' as const },
  { to: '/admin/operator', label: ru.nav.operator, icon: Headphones, feature: 'operator' as const },
  { to: '/admin/rtc-diagnostics', label: 'RTC', icon: Radio, feature: 'operator' as const },
  { to: '/admin/settings', label: ru.nav.settings, icon: Settings, feature: 'settings' as const },
].filter((item) => FEATURES[item.feature]);

interface AdminLayoutProps {
  wsConnected: boolean;
}

export function AdminLayout({ wsConnected }: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const session = useAuthStore((s) => s.session);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.logout();
    clear();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/8 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#39ff14]/15 text-[#39ff14] shadow-[0_0_20px_rgba(57,255,20,0.2)]">
            <Bot size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{ru.app.name}</p>
            <p className="truncate text-xs text-zinc-500">{session?.workspace.name}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                isActive
                  ? 'bg-[#39ff14]/10 text-[#39ff14] shadow-[inset_0_0_0_1px_rgba(57,255,20,0.25)]'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white',
              ].join(' ')
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/8 p-4">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-zinc-500">{ru.dashboard.realtime}</span>
          <span className={wsConnected ? 'text-[#39ff14]' : 'text-zinc-500'}>
            {wsConnected ? ru.dashboard.connected : ru.dashboard.disconnected}
          </span>
        </div>
        <Button variant="ghost" className="w-full justify-start" onClick={() => void handleLogout()}>
          <LogOut size={16} />
          {ru.auth.logout}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(57,255,20,0.08),_transparent_50%)]" />

      <div className="relative flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/8 bg-white/[0.02] backdrop-blur-xl lg:block">
          {sidebar}
        </aside>

        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <motion.aside
          initial={false}
          animate={{ x: mobileOpen ? 0 : -280 }}
          className="fixed inset-y-0 left-0 z-50 w-64 border-r border-white/8 bg-[#0a0a0b]/95 backdrop-blur-xl lg:hidden"
        >
          <button
            type="button"
            className="absolute right-3 top-4 rounded-lg p-2 text-zinc-400 hover:bg-white/5"
            onClick={() => setMobileOpen(false)}
            aria-label="Закрыть меню"
          >
            <X size={18} />
          </button>
          {sidebar}
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-[#0a0a0b]/80 px-4 py-3 backdrop-blur-xl lg:px-8">
            <button
              type="button"
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
            >
              <Menu size={20} />
            </button>
            <div className="flex-1" />
            <span className="hidden text-sm text-zinc-400 sm:inline">{session?.user.email}</span>
          </header>

          <main className="flex-1 p-4 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
