import { z } from 'zod';
import { WorkspaceRoleSchema } from './auth.js';

export const InviteMemberSchema = z.object({
  email: z.string().email().max(320),
  role: WorkspaceRoleSchema.refine(
    (r) => r !== 'OWNER',
    { message: 'Нельзя назначить роль OWNER через приглашение' },
  ),
});

export const UpdateMemberRoleSchema = z.object({
  role: WorkspaceRoleSchema.refine((r) => r !== 'OWNER', {
    message: 'Передача OWNER выполняется отдельно',
  }),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;

export interface WorkspaceMemberDto {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: z.infer<typeof WorkspaceRoleSchema>;
  createdAt: string;
  isOnline: boolean;
  activeSessions: number;
}

export interface WorkspaceInviteDto {
  id: string;
  email: string;
  role: z.infer<typeof WorkspaceRoleSchema>;
  inviteUrl: string;
  expiresAt: string;
  createdAt: string;
}

export interface InviteMemberResultDto {
  kind: 'member_added' | 'invite_created';
  member?: WorkspaceMemberDto;
  invite?: WorkspaceInviteDto;
}

export const OPERATOR_ROLE_DESCRIPTIONS: Record<
  z.infer<typeof WorkspaceRoleSchema>,
  { label: string; description: string }
> = {
  OWNER: { label: 'Владелец', description: 'Полный доступ ко всему workspace' },
  ADMIN: { label: 'Администратор', description: 'Операторы, виджеты, RTC, ассистенты' },
  OPERATOR: { label: 'Оператор', description: 'Чаты и звонки с посетителями' },
  MEMBER: { label: 'Участник', description: 'Расширенный доступ (legacy)' },
  VIEWER: { label: 'Наблюдатель', description: 'Только мониторинг без действий' },
};
