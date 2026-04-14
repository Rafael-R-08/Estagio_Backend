import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, ServiceLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { buildNewMemberEmail } from '../notifications/templates/email-templates';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateAdminPlatformDto } from './dto/update-admin-platform.dto';
import { CreateAdminPlatformDto } from './dto/create-admin-platform.dto';
import { AuditService } from './audit.service';
import { encryptApiKey, isEncrypted } from '../common/platform-crypto.util';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private config: ConfigService,
    private auditService: AuditService,
  ) {}

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        experienceLevel: true,
        userFunction: true,
        serviceLine: true,
        onboardingDone: true,
        managedLineId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        experienceLevel: true,
        interests: true,
        userFunction: true,
        serviceLine: true,
        onboardingDone: true,
        managedLineId: true,
        createdAt: true,
        updatedAt: true,
        skills: true,
      },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    return user;
  }

  async updateUser(id: string, dto: UpdateAdminUserDto, requesterId?: string) {
    if (requesterId && requesterId === id) {
      if (dto.isActive === false || dto.role !== undefined) {
        throw new ForbiddenException(
          'Não pode alterar a sua própria role ou desativar a sua conta',
        );
      }
    }

    if (dto.role === 'SERVICE_LINE_MANAGER' && !dto.managedLineId) {
      const user = await this.getUser(id);
      if (user.role !== 'SERVICE_LINE_MANAGER' || !user.managedLineId) {
         throw new BadRequestException('managedLineId is required when role is SERVICE_LINE_MANAGER');
      }
    }

    const currentUser = await this.getUser(id);
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: dto as any,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
        managedLineId: true,
        serviceLine: true,
      },
    });

    // Notify SL Manager when a user is assigned to (or moves to) a service line
    if (dto.serviceLine && dto.serviceLine !== currentUser.serviceLine) {
      this.notifyServiceLineManager(updatedUser as { id: string; name: string | null; email: string }, dto.serviceLine).catch((err) =>
        this.logger.warn(`Falha ao notificar gestor de linha: ${err.message}`),
      );
    }

    // Audit log
    if (dto.role !== undefined) {
      void this.auditService.log({
        action: 'ROLE_UPDATED',
        adminId: requesterId,
        targetId: id,
        details: `${currentUser.role} → ${dto.role}`,
      });
    } else if (dto.isActive === false) {
      void this.auditService.log({
        action: 'USER_DEACTIVATED',
        adminId: requesterId,
        targetId: id,
        details: currentUser.email,
      });
    } else if (dto.isActive === true) {
      void this.auditService.log({
        action: 'USER_ACTIVATED',
        adminId: requesterId,
        targetId: id,
        details: currentUser.email,
      });
    }

    // Strip the internal serviceLine field before returning to match original select shape
    const { serviceLine: _sl, ...result } = updatedUser;
    return result;
  }

  private async notifyServiceLineManager(
    newMember: { id: string; name: string | null; email: string },
    serviceLine: ServiceLine,
  ) {
    const frontendUrl = this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';

    const manager = await this.prisma.user.findFirst({
      where: { role: 'SERVICE_LINE_MANAGER', managedLineId: serviceLine, isActive: true },
      select: { id: true, name: true, email: true, settings: true },
    });

    if (!manager) return;

    const settings = manager.settings;

    if (!settings || settings.notifyInApp) {
      await this.notificationsService.create({
        userId: manager.id,
        type: NotificationType.GENERAL,
        title: 'Novo membro na tua linha',
        body: `${newMember.name ?? newMember.email} foi adicionado(a) à tua linha de serviço.`,
        metadata: { memberId: newMember.id, serviceLine },
      });
    }

    if (!settings || settings.notifyByEmail) {
      const { subject, html, text } = buildNewMemberEmail(
        manager.name ?? '',
        newMember.name ?? '',
        newMember.email,
        serviceLine,
        frontendUrl,
      );
      await this.emailService.sendMail({ to: manager.email, subject, html, text });
    }
  }

  async deleteUser(id: string) {
    await this.getUser(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Utilizador eliminado com sucesso' };
  }

  async getAnalytics() {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      // Users
      totalUsers,
      activeUsers,
      onboardedUsers,
      usersByRole,
      usersByServiceLine,
      usersByExperienceLevel,
      recentUsers,
      allUsers,
      // Trainings
      trainingsByStatus,
      completedTrainings,
      allLinkedTrainings,
      // Certificates
      totalCertificates,
      certsByStatus,
      certsIssuedThisMonth,
      expiringIn30,
      expiringIn60,
      expiringCerts,
      // AI
      totalConversations,
      conversationsLast30Days,
      totalMessages,
      // Platforms & Courses
      totalPlatforms,
      activePlatforms,
      totalCourses,
      // Skills
      userSkills,
    ] = await Promise.all([
      // Users
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { onboardingDone: true } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      this.prisma.user.groupBy({
        by: ['serviceLine'],
        _count: { id: true },
        where: { serviceLine: { not: null } },
      }),
      this.prisma.user.groupBy({
        by: ['experienceLevel'],
        _count: { id: true },
        where: { experienceLevel: { not: null } },
      }),
      this.prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true, serviceLine: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.user.findMany({
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Trainings
      this.prisma.trainingRecord.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.trainingRecord.findMany({
        where: { status: 'completed', completedAt: { not: null } },
        select: { completedAt: true, platform: { select: { name: true } } },
      }),
      this.prisma.trainingRecord.findMany({
        where: { platformId: { not: null } },
        select: { platform: { select: { name: true } } },
      }),
      // Certificates
      this.prisma.certificate.count(),
      this.prisma.certificate.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.certificate.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.certificate.count({
        where: { expirationDate: { gte: now, lte: in30Days } },
      }),
      this.prisma.certificate.count({
        where: { expirationDate: { gt: in30Days, lte: in60Days } },
      }),
      this.prisma.certificate.findMany({
        where: { expirationDate: { gte: now, lte: in90Days } },
        select: {
          expirationDate: true,
          courseName: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { expirationDate: 'asc' },
      }),
      // AI
      this.prisma.conversation.count(),
      this.prisma.conversation.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.message.count(),
      // Platforms & Courses
      this.prisma.learningPlatform.count(),
      this.prisma.learningPlatform.count({ where: { enabled: true } }),
      this.prisma.course.count(),
      // Skills
      this.prisma.userSkill.findMany({ select: { skillName: true } }),
    ]);

    // ── User overview ────────────────────────────────────────────────────
    const overview = {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      onboardingRate: totalUsers ? Math.round((onboardedUsers / totalUsers) * 100) : 0,
      newUsersThisMonth: allUsers.filter((u) => u.createdAt >= startOfMonth).length,
      usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count.id])),
      usersByServiceLine: Object.fromEntries(
        usersByServiceLine.map((sl) => [sl.serviceLine ?? 'Sem service line', sl._count.id]),
      ),
      usersByExperienceLevel: Object.fromEntries(
        usersByExperienceLevel.map((el) => [el.experienceLevel ?? 'Sem nível', el._count.id]),
      ),
    };

    // ── Training stats ───────────────────────────────────────────────────
    const statusCounts = Object.fromEntries(
      trainingsByStatus.map((t) => [t.status, t._count.id]),
    );
    const completedCount = statusCounts['completed'] ?? 0;
    const totalTrainings = trainingsByStatus.reduce((s, t) => s + t._count.id, 0);
    const trainingStats = {
      total: totalTrainings,
      byStatus: statusCounts,
      completionRate: totalTrainings ? Math.round((completedCount / totalTrainings) * 100) : 0,
    };

    // ── Certificate stats ────────────────────────────────────────────────
    const certStatusCounts = Object.fromEntries(
      certsByStatus.map((c) => [c.status, c._count.id]),
    );
    const certificateStats = {
      total: totalCertificates,
      byStatus: certStatusCounts,
      issuedThisMonth: certsIssuedThisMonth,
      expiringIn30Days: expiringIn30,
      expiringIn31to60Days: expiringIn60,
    };

    // ── AI usage ─────────────────────────────────────────────────────────
    const aiUsageStats = {
      totalConversations,
      conversationsLast30Days,
      totalMessages,
      avgMessagesPerConversation:
        totalConversations ? Math.round((totalMessages / totalConversations) * 10) / 10 : 0,
    };

    // ── Platform stats ───────────────────────────────────────────────────
    const platformStats = {
      total: totalPlatforms,
      active: activePlatforms,
      inactive: totalPlatforms - activePlatforms,
      totalIndexedCourses: totalCourses,
    };

    // ── Charts ───────────────────────────────────────────────────────────
    const completedMap = new Map<string, number>();
    for (const t of completedTrainings) {
      if (!t.completedAt) continue;
      const key = `${t.completedAt.getFullYear()}-${String(t.completedAt.getMonth() + 1).padStart(2, '0')}`;
      completedMap.set(key, (completedMap.get(key) ?? 0) + 1);
    }
    const completedByMonth = [...completedMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    const platformMap = new Map<string, number>();
    for (const t of allLinkedTrainings) {
      const name = t.platform?.name ?? 'Outro';
      platformMap.set(name, (platformMap.get(name) ?? 0) + 1);
    }
    const platformUsage = [...platformMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    const growthMap = new Map<string, number>();
    for (const u of allUsers) {
      const key = `${u.createdAt.getFullYear()}-${String(u.createdAt.getMonth() + 1).padStart(2, '0')}`;
      growthMap.set(key, (growthMap.get(key) ?? 0) + 1);
    }
    let cumulative = 0;
    const userGrowth = [...growthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => {
        cumulative += count;
        return { month, count: cumulative };
      });

    const skillMap = new Map<string, number>();
    for (const us of userSkills) {
      skillMap.set(us.skillName, (skillMap.get(us.skillName) ?? 0) + 1);
    }
    const topSkills = [...skillMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

    const expiringCertificates = expiringCerts.map((c) => {
      const daysLeft = Math.ceil(
        (c.expirationDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        userId: c.user.id,
        userName: c.user.name ?? c.user.email,
        courseName: c.courseName ?? 'Sem nome',
        expirationDate: c.expirationDate!.toISOString(),
        daysLeft,
      };
    });

    return {
      overview,
      trainingStats,
      certificateStats,
      aiUsageStats,
      platformStats,
      recentUsers,
      // Charts
      completedByMonth,
      platformUsage,
      userGrowth,
      topSkills,
      expiringCertificates,
    };
  }

  async getPlatforms() {
    const platforms = await this.prisma.learningPlatform.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    return platforms.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      apiEndpoint: p.apiEndpoint,
      apiKeyRequired: p.apiKeyRequired,
      isActive: p.enabled,
      isSearchEnabled: p.searchEnabled,
      totalCourses: p._count.courses,
    }));
  }

  async createPlatform(dto: CreateAdminPlatformDto) {
    const existing = await this.prisma.learningPlatform.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new BadRequestException(`Plataforma '${dto.name}' já existe`);

    const { config, enabled, searchEnabled, apiKey, ...rest } = dto;
    const encKey = this.config.get<string>('platforms.encryptionKey') ?? '';
    const encryptedApiKey = apiKey && encKey
      ? encryptApiKey(apiKey, encKey)
      : apiKey;

    const created = await this.prisma.learningPlatform.create({
      data: {
        ...rest,
        apiKey: encryptedApiKey,
        enabled: enabled ?? true,
        searchEnabled: searchEnabled ?? true,
        config: config ? JSON.parse(config) : {},
      },
    });

    void this.auditService.log({
      action: 'PLATFORM_CREATED',
      details: created.name,
    });

    return {
      id: created.id,
      name: created.name,
      type: created.type,
      apiEndpoint: created.apiEndpoint,
      apiKeyRequired: created.apiKeyRequired,
      isActive: created.enabled,
      isSearchEnabled: created.searchEnabled,
    };
  }

  async updatePlatform(id: string, dto: UpdateAdminPlatformDto) {
    const platform = await this.prisma.learningPlatform.findUnique({
      where: { id },
    });
    if (!platform) throw new NotFoundException('Plataforma não encontrada');

    const { isActive, isSearchEnabled, config, apiKey, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (isActive !== undefined) data.enabled = isActive;
    if (isSearchEnabled !== undefined) data.searchEnabled = isSearchEnabled;
    if (config !== undefined) data.config = JSON.parse(config);
    if (apiKey !== undefined) {
      const encKey = this.config.get<string>('platforms.encryptionKey') ?? '';
      data.apiKey = encKey && !isEncrypted(apiKey)
        ? encryptApiKey(apiKey, encKey)
        : apiKey;
    }

    const updated = await this.prisma.learningPlatform.update({
      where: { id },
      data,
    });

    void this.auditService.log({
      action: 'PLATFORM_UPDATED',
      targetId: id,
      details: updated.name,
    });

    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      apiEndpoint: updated.apiEndpoint,
      apiKeyRequired: updated.apiKeyRequired,
      isActive: updated.enabled,
      isSearchEnabled: updated.searchEnabled,
    };
  }
}
