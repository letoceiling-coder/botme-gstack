import { z } from 'zod';

export const WorkspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const RegisterSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов'),
  name: z.string().min(1, 'Укажите имя').max(120),
  workspaceName: z.string().min(1, 'Укажите название workspace').max(120),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

export const SwitchWorkspaceSchema = z.object({
  workspaceId: z.string().cuid(),
});

export type SwitchWorkspaceInput = z.infer<typeof SwitchWorkspaceSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  locale: string;
}

export interface AuthWorkspace {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSession {
  user: AuthUser;
  workspace: AuthWorkspace;
  workspaces: AuthWorkspace[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
  type: 'access';
}

export interface RealtimePresenceEvent {
  type: 'presence';
  workspaceId: string;
  userId: string;
  status: 'online' | 'offline';
  at: string;
}

export interface RealtimePingEvent {
  type: 'ping';
  at: string;
}

export interface RealtimePongEvent {
  type: 'pong';
  at: string;
}

export type RealtimeEvent = RealtimePresenceEvent | RealtimePingEvent | RealtimePongEvent;
