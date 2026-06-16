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

export interface WidgetSummary {
  id: string;
  name: string;
}

export class OperatorWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorWorkspaceError';
  }
}

let runtimeAccessToken: string | null = null;

export function getRuntimeAccessToken(): string | null {
  return runtimeAccessToken;
}

export function clearRuntimeAccessToken(): void {
  runtimeAccessToken = null;
}

function apiBase(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  return '';
}

function resolveRuntimeToken(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

function resolveOperatorKey(explicit?: string | null): string | null {
  if (explicit) return explicit;
  return new URLSearchParams(window.location.search).get('operatorKey');
}

function resolveTheme(): string {
  return new URLSearchParams(window.location.search).get('theme') ?? 'dark';
}

export function applyOperatorTheme(): void {
  const theme = resolveTheme();
  document.documentElement.dataset.botmeTheme = theme;
  if (theme === 'dark') {
    document.documentElement.classList.add('op-theme-dark');
  } else {
    document.documentElement.classList.remove('op-theme-dark');
  }
}

function authFetchHeaders(): { headers: Record<string, string>; credentials: RequestCredentials } {
  const headers: Record<string, string> = {};
  const token = runtimeAccessToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers, credentials: token ? 'omit' : 'include' };
}

export async function fetchMe(accessToken?: string | null): Promise<AuthMeResponse | null> {
  const token = accessToken ?? runtimeAccessToken;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiBase()}/api/auth/me`, {
    credentials: token ? 'omit' : 'include',
    headers,
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Не удалось проверить сессию');
  return res.json() as Promise<AuthMeResponse>;
}

export async function fetchWidgets(): Promise<WidgetSummary[]> {
  const { headers, credentials } = authFetchHeaders();
  const res = await fetch(`${apiBase()}/api/widgets`, { credentials, headers });
  if (!res.ok) return [];
  const data = (await res.json()) as WidgetSummary[];
  return data.map((w) => ({ id: w.id, name: w.name }));
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
  clearRuntimeAccessToken();
  return res.json() as Promise<AuthMeResponse>;
}

export async function logout(): Promise<void> {
  clearRuntimeAccessToken();
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

export async function exchangeRuntimeToken(
  token: string,
  workspaceId?: string | null,
): Promise<AuthMeResponse> {
  const res = await fetch(`${apiBase()}/api/public/operator-runtime/session`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      ...(workspaceId ? { workspaceId } : {}),
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Недействительный operator token');
  }
  const data = (await res.json()) as {
    accessToken: string;
    user: AuthMeResponse['user'];
    workspace: AuthMeResponse['workspace'];
  };
  runtimeAccessToken = data.accessToken;
  return { user: data.user, workspace: data.workspace };
}

/**
 * Safe operator auth bootstrap:
 * 1. runtime token (?token=) for embed/self-host
 * 2. cookie session + optional operatorKey workspace switch
 */
export async function bootstrapOperatorSession(operatorKey?: string | null): Promise<AuthMeResponse | null> {
  applyOperatorTheme();

  const runtimeToken = resolveRuntimeToken();
  if (runtimeToken && runtimeToken !== 'YOUR_OPERATOR_TOKEN') {
    const workspaceId = new URLSearchParams(window.location.search).get('workspace');
    return exchangeRuntimeToken(runtimeToken, workspaceId);
  }

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
