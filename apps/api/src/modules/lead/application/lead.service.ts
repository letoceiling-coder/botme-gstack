import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@botme/database';
import { LeadFilterSchema, UpdateLeadSchema, type LeadDto } from '@botme/shared';
import { LeadRepository } from '../infrastructure/lead.repository';

@Injectable()
export class LeadService {
  constructor(private readonly leads: LeadRepository) {}

  list(workspaceId: string, query: Record<string, string | undefined>): Promise<LeadDto[]> {
    const filter = LeadFilterSchema.parse({
      status: query.status,
      source: query.source,
      assistantId: query.assistantId,
      search: query.search,
    });
    return this.leads.list(workspaceId, filter).then((rows) => rows.map((r) => this.toDto(r)));
  }

  async update(workspaceId: string, id: string, body: unknown): Promise<LeadDto> {
    const input = UpdateLeadSchema.parse(body);
    const existing = await this.leads.findById(workspaceId, id);
    if (!existing) throw new NotFoundException('Лид не найден');

    const data: Prisma.LeadUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.name !== undefined) data.name = input.name || null;
    if (input.email !== undefined) data.email = input.email || null;
    if (input.phone !== undefined) data.phone = input.phone || null;
    if (input.notes !== undefined) data.notes = input.notes || null;

    const updated = await this.leads.update(workspaceId, id, data);
    return this.toDto({ ...updated, assistant: null });
  }

  async exportCsv(workspaceId: string): Promise<string> {
    const rows = await this.leads.list(workspaceId, {});
    const header = 'id,status,source,name,email,phone,notes,assistantId,conversationId,createdAt';
    const lines = rows.map((r) =>
      [
        r.id,
        r.status,
        r.source,
        csvEscape(r.name),
        csvEscape(r.email),
        csvEscape(r.phone),
        csvEscape(r.notes),
        r.assistantId ?? '',
        r.conversationId ?? '',
        r.createdAt.toISOString(),
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  private toDto(
    r: Awaited<ReturnType<LeadRepository['list']>>[number] | (Awaited<ReturnType<LeadRepository['findById']>> & { assistant: null }),
  ): LeadDto {
    if (!r) throw new NotFoundException('Лид не найден');
    return {
      id: r.id,
      status: r.status,
      source: r.source,
      name: r.name,
      email: r.email,
      phone: r.phone,
      notes: r.notes,
      assistantId: r.assistantId,
      assistantName: 'assistant' in r && r.assistant ? r.assistant.name : null,
      conversationId: r.conversationId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

function csvEscape(value: string | null | undefined): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
