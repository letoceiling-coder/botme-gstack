import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  bootstrapOperatorSession,
  fetchMe,
  login,
  OperatorWorkspaceError,
  type AuthMeResponse,
} from './lib/api';

interface OperatorAuthGateProps {
  children: (session: AuthMeResponse) => ReactNode;
}

export function OperatorAuthGate({ children }: OperatorAuthGateProps) {
  const [session, setSession] = useState<AuthMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const hydrate = async () => {
    setError(null);
    try {
      const bootstrapped = await bootstrapOperatorSession();
      setSession(bootstrapped);
    } catch (err) {
      if (err instanceof OperatorWorkspaceError) {
        setError(err.message);
        setSession(await fetchMe());
      } else {
        setSession(null);
      }
    }
  };

  useEffect(() => {
    void hydrate().finally(() => setLoading(false));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const bootstrapped = await bootstrapOperatorSession();
      setSession(bootstrapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="op-auth">
        <p className="op-muted">Проверка сессии…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="op-auth">
        <form className="op-auth-form" onSubmit={(e) => void onSubmit(e)}>
          <h1>Панель оператора</h1>
          <p className="op-muted">Войдите для управления live-чатами и видеозвонками</p>
          {error && <p className="op-error">{error}</p>}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="op-auth-submit">
            Войти
          </button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="op-auth">
        <p className="op-error">{error}</p>
        <p className="op-muted">Workspace: {session.workspace.name}</p>
      </div>
    );
  }

  return <>{children(session)}</>;
}
