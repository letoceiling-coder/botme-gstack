import { z } from 'zod';

export const LeadStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'SPAM']);
export const LeadSourceSchema = z.enum(['WIDGET', 'TEST_CHAT', 'API', 'MANUAL']);

export const UpdateLeadSchema = z.object({
  status: LeadStatusSchema.optional(),
  name: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
});

export const LeadFilterSchema = z.object({
  status: LeadStatusSchema.optional(),
  source: LeadSourceSchema.optional(),
  assistantId: z.string().cuid().optional(),
  search: z.string().max(200).optional(),
});

export interface LeadDto {
  id: string;
  status: string;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  assistantId: string | null;
  assistantName: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}
