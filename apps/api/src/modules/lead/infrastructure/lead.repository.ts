import { Injectable } from '@nestjs/common';
import type { Lead, Prisma } from '@botme/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class LeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string, filter: {
    status?: string;
    source?: string;
    assistantId?: string;
    search?: string;
  }): Promise<(Lead & { assistant: { name: string } | null })[]> {
    const where: Prisma.LeadWhereInput = { workspaceId };
    if (filter.status) where.status = filter.status as Lead['status'];
    if (filter.source) where.source = filter.source as Lead['source'];
    if (filter.assistantId) where.assistantId = filter.assistantId;
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
        { phone: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.client.lead.findMany({
      where,
      include: { assistant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  findById(workspaceId: string, id: string): Promise<Lead | null> {
    return this.prisma.client.lead.findFirst({ where: { workspaceId, id } });
  }

  update(workspaceId: string, id: string, data: Prisma.LeadUpdateInput): Promise<Lead> {
    return this.prisma.client.lead.update({ where: { id, workspaceId }, data });
  }

  count(workspaceId: string): Promise<number> {
    return this.prisma.client.lead.count({ where: { workspaceId } });
  }
}
