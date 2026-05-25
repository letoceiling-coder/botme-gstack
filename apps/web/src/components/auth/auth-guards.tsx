import { Navigate, Outlet } from 'react-router-dom';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

/** Blocks protected routes until auth bootstrap completes — prevents login flicker. */
export function AuthBootstrapGate() {
  const initialized = useAuthStore((s) => s.initialized);
  const loading = useAuthStore((s) => s.loading);

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#39ff14]" />
          <p className="text-sm text-zinc-500">{ru.common.loading}</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export function RequireAuth() {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function GuestOnly() {
  const session = useAuthStore((s) => s.session);
  if (session) return <Navigate to="/admin" replace />;
  return <Outlet />;
}
