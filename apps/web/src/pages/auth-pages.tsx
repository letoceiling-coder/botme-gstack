import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LoginSchema, RegisterSchema } from '@botme/shared';
import { Button, Card, Input } from '@botme/ui';
import { ru } from '@/i18n/ru';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? ru.common.error);
      return;
    }
    setLoading(true);
    try {
      const session = await api.login(parsed.data);
      setSession(session);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : ru.common.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={ru.auth.login}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Input label={ru.auth.email} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label={ru.auth.password} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" className="w-full" loading={loading}>
          {ru.auth.submitLogin}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        {ru.auth.noAccount}{' '}
        <Link to="/register" className="text-[#39ff14] hover:underline">
          {ru.auth.register}
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ email: '', password: '', name: '', workspaceName: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = RegisterSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? ru.common.error);
      return;
    }
    setLoading(true);
    try {
      const session = await api.register(parsed.data);
      setSession(session);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : ru.common.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={ru.auth.register}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Input label={ru.auth.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label={ru.auth.workspaceName} value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} />
        <Input label={ru.auth.email} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label={ru.auth.password} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" className="w-full" loading={loading}>
          {ru.auth.submitRegister}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        {ru.auth.hasAccount}{' '}
        <Link to="/login" className="text-[#39ff14] hover:underline">
          {ru.auth.login}
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] p-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(57,255,20,0.1),_transparent_55%)]" />
      <Card className="relative w-full max-w-md">
        <h1 className="mb-1 text-xl font-semibold text-white">{title}</h1>
        <p className="mb-6 text-sm text-zinc-400">{ru.app.tagline}</p>
        {children}
      </Card>
    </div>
  );
}
