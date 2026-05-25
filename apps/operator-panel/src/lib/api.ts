export interface AuthWorkspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface AuthMeResponse {
  user: { id: string; email: string; name: string };
  workspace: AuthWorkspace;
  workspaces?: AuthWorkspace[];
}

export interface OperatorInitResponse {
  operatorKey: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  panelOrigin?: string;
}

export class OperatorWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorWorkspaceError';
  }
}

function apiBase(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  return '';
}

function resolveOperatorKey(explicit?: string | null): string | null {
  if (explicit) return explicit;
  return new URLSearchParams(window.location.search).get('operatorKey');
}

export async function fetchMe(): Promise<AuthMeResponse | null> {
  const res = await fetch(`${apiBase()}/api/auth/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Не удалось проверить сессию');
  return res.json() as Promise<AuthMeResponse>;
}

export async function login(email: string, password: string): Promise<AuthMeResponse> {
  const res = await fetch(`${apiBase()}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Неверный email или пароль');
  }
  return res.json() as Promise<AuthMeResponse>;
}

export async function logout(): Promise<void> {
  await fetch(`${apiBase()}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

export async function switchWorkspace(workspaceId: string): Promise<AuthMeResponse> {
  const res = await fetch(`${apiBase()}/api/auth/switch-workspace`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Не удалось переключить workspace');
  }
  return res.json() as Promise<AuthMeResponse>;
}

export async function fetchOperatorInit(operatorKey: string): Promise<OperatorInitResponse | null> {
  const res = await fetch(`${apiBase()}/api/public/operator/${encodeURIComponent(operatorKey)}/init`, {
    credentials: 'omit',
  });
  if (!res.ok) return null;
  return res.json() as Promise<OperatorInitResponse>;
}

/**
 * Safe operator auth bootstrap:
 * 1. require hydrated session (cookies present)
 * 2. resolve operator key → workspace via public init
 * 3. validate membership
 * 4. switch workspace if needed
 */
export async function bootstrapOperatorSession(operatorKey?: string | null): Promise<AuthMeResponse | null> {
  const key = resolveOperatorKey(operatorKey);
  const session = await fetchMe();
  if (!session) return null;
  if (!key) return session;

  const init = await fetchOperatorInit(key);
  if (!init?.workspaceId) return session;
  if (session.workspace.id === init.workspaceId) return session;

  const memberships = session.workspaces ?? [];
  const hasMembership = memberships.some((w) => w.id === init.workspaceId);
  if (!hasMembership) {
    throw new OperatorWorkspaceError(
      `Нет доступа к workspace «${init.workspaceName}». Обратитесь к владельцу workspace.`,
    );
  }

  return switchWorkspace(init.workspaceId);
}
