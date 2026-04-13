import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogDto {
  action: string;
  adminId?: string;
  targetId?: string;
  details?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(dto: LogDto): Promise<void> {
    await this.prisma.auditLog.create({ data: dto });
  }

  async findAll({ limit = 20, offset = 0 }: { limit?: number; offset?: number }) {
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count(),
    ]);

    // Resolve actor and target names in one query
    const allUserIds = [
      ...new Set(
        [
          ...logs.map((l) => l.adminId),
          ...logs.map((l) => l.targetId),
        ].filter(Boolean) as string[],
      ),
    ];
    const users =
      allUserIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

    const items = logs.map((l) => ({
      ...l,
      actorName: l.adminId ? (userMap.get(l.adminId) ?? null) : null,
      targetName: l.targetId ? (userMap.get(l.targetId) ?? null) : null,
    }));

    return { items, total };
  }
}
