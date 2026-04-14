import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceLine } from '@prisma/client';

@Injectable()
export class SlManagerService {
  constructor(private prisma: PrismaService) {}

  // ── Internal helpers ─────────────────────────────────────────────────────

  async getManagerLineId(managerId: string): Promise<ServiceLine> {
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { managedLineId: true },
    });
    if (!manager?.managedLineId) {
      throw new ForbiddenException('Não tem uma service line atribuída.');
    }
    return manager.managedLineId;
  }

  private async assertUserInLine(userId: string, lineId: ServiceLine) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { serviceLine: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    if (user.serviceLine !== lineId) {
      throw new ForbiddenException('O utilizador não pertence à sua service line.');
    }
  }

  // ── My Line overview ─────────────────────────────────────────────────────

  async getLineOverview(managerId: string) {
    const lineId = await this.getManagerLineId(managerId);
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalMembers,
      activeMembers,
      membersByLevel,
      totalCompletedTrainings,
      completionsLast30Days,
      totalActiveCerts,
      expiringCertsCount,
      totalSkills,
      ongoingTrainings,
    ] = await Promise.all([
      this.prisma.user.count({ where: { serviceLine: lineId } }),
      this.prisma.user.count({ where: { serviceLine: lineId, isActive: true } }),
      this.prisma.user.groupBy({
        by: ['experienceLevel'],
        where: { serviceLine: lineId },
        _count: { id: true },
      }),
      this.prisma.trainingRecord.count({
        where: { status: 'completed', user: { serviceLine: lineId } },
      }),
      this.prisma.trainingRecord.count({
        where: {
          status: 'completed',
          completedAt: { gte: thirtyDaysAgo },
          user: { serviceLine: lineId },
        },
      }),
      this.prisma.certificate.count({
        where: { status: 'COMPLETED', user: { serviceLine: lineId } },
      }),
      this.prisma.certificate.count({
        where: {
          status: 'COMPLETED',
          expirationDate: { gte: now, lte: in90Days },
          user: { serviceLine: lineId },
        },
      }),
      this.prisma.userSkill.count({ where: { user: { serviceLine: lineId } } }),
      this.prisma.trainingRecord.count({
        where: { status: 'ongoing', user: { serviceLine: lineId } },
      }),
    ]);

    return {
      serviceLine: lineId,
      totalMembers,
      activeMembers,
      inactiveMembers: totalMembers - activeMembers,
      membersByExperienceLevel: Object.fromEntries(
        membersByLevel.map((l) => [l.experienceLevel ?? 'sem_nivel', l._count.id]),
      ),
      trainingStats: {
        totalCompleted: totalCompletedTrainings,
        completedLast30Days: completionsLast30Days,
        ongoing: ongoingTrainings,
        avgCompletedPerMember:
          totalMembers ? Math.round((totalCompletedTrainings / totalMembers) * 10) / 10 : 0,
      },
      certificateStats: {
        totalActive: totalActiveCerts,
        expiringIn90Days: expiringCertsCount,
      },
      totalSkillsTracked: totalSkills,
    };
  }

  // ── User list (table) ─────────────────────────────────────────────────────

  async getManagedUsers(managerId: string) {
    const lineId = await this.getManagerLineId(managerId);
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: { serviceLine: lineId },
      select: {
        id: true,
        name: true,
        email: true,
        userFunction: true,
        experienceLevel: true,
        isActive: true,
        onboardingDone: true,
        createdAt: true,
        _count: {
          select: {
            skills: true,
          },
        },
        trainings: {
          select: { status: true, completedAt: true },
        },
        certificates: {
          where: { status: 'COMPLETED' },
          select: { expirationDate: true, courseName: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return users.map((u) => {
      const completedTrainings = u.trainings.filter((t) => t.status === 'completed');
      const lastCompletedAt = completedTrainings
        .map((t) => t.completedAt)
        .filter(Boolean)
        .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

      const activeCerts = u.certificates.filter(
        (c) => !c.expirationDate || c.expirationDate > now,
      );
      const expiringCerts = u.certificates.filter(
        (c) => c.expirationDate && c.expirationDate >= now && c.expirationDate <= in90Days,
      );

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        userFunction: u.userFunction,
        experienceLevel: u.experienceLevel,
        isActive: u.isActive,
        onboardingDone: u.onboardingDone,
        joinedAt: u.createdAt,
        skillsCount: u._count.skills,
        trainings: {
          total: u.trainings.length,
          completed: completedTrainings.length,
          ongoing: u.trainings.filter((t) => t.status === 'ongoing').length,
          lastCompletedAt,
        },
        certificates: {
          active: activeCerts.length,
          expiringSoon: expiringCerts.length,
        },
      };
    });
  }

  // ── User detail ───────────────────────────────────────────────────────────

  async getUserDetail(managerId: string, userId: string) {
    const lineId = await this.getManagerLineId(managerId);
    await this.assertUserInLine(userId, lineId);

    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        userFunction: true,
        experienceLevel: true,
        isActive: true,
        onboardingDone: true,
        interests: true,
        createdAt: true,
        skills: {
          select: { skillName: true, level: true, createdAt: true },
          orderBy: { skillName: 'asc' },
        },
        trainings: {
          select: {
            id: true,
            title: true,
            status: true,
            startedAt: true,
            completedAt: true,
            rating: true,
            durationHours: true,
            platform: { select: { name: true } },
          },
          orderBy: { completedAt: { sort: 'desc', nulls: 'last' } },
        },
        certificates: {
          select: {
            id: true,
            courseName: true,
            provider: true,
            completionDate: true,
            expirationDate: true,
            status: true,
            fileUrl: true,
          },
          orderBy: { completionDate: { sort: 'desc', nulls: 'last' } },
        },
      },
    });

    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const completedTrainings = user.trainings.filter((t) => t.status === 'completed');
    const totalDurationHours = completedTrainings.reduce(
      (sum, t) => sum + (t.durationHours ?? 0),
      0,
    );

    const activeCerts = user.certificates.filter(
      (c) => c.status === 'COMPLETED' && (!c.expirationDate || c.expirationDate > now),
    );
    const expiredCerts = user.certificates.filter(
      (c) => c.expirationDate && c.expirationDate <= now,
    );
    const expiringCerts = user.certificates.filter(
      (c) =>
        c.status === 'COMPLETED' &&
        c.expirationDate &&
        c.expirationDate >= now &&
        c.expirationDate <= in90Days,
    );

    return {
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        userFunction: user.userFunction,
        experienceLevel: user.experienceLevel,
        isActive: user.isActive,
        onboardingDone: user.onboardingDone,
        interests: user.interests,
        joinedAt: user.createdAt,
      },
      summary: {
        totalTrainings: user.trainings.length,
        completedTrainings: completedTrainings.length,
        ongoingTrainings: user.trainings.filter((t) => t.status === 'ongoing').length,
        totalLearningHours: Math.round(totalDurationHours * 10) / 10,
        avgRating: completedTrainings.filter((t) => t.rating).length
          ? Math.round(
              (completedTrainings.reduce((s, t) => s + (t.rating ?? 0), 0) /
                completedTrainings.filter((t) => t.rating).length) *
                10,
            ) / 10
          : null,
        totalCertificates: user.certificates.length,
        activeCertificates: activeCerts.length,
        expiredCertificates: expiredCerts.length,
        certificatesExpiringSoon: expiringCerts.length,
        skillsCount: user.skills.length,
      },
      completedTrainings: completedTrainings.map((t) => ({
        id: t.id,
        title: t.title,
        platform: t.platform?.name ?? null,
        completedAt: t.completedAt,
        durationHours: t.durationHours,
        rating: t.rating,
      })),
      ongoingTrainings: user.trainings
        .filter((t) => t.status === 'ongoing')
        .map((t) => ({
          id: t.id,
          title: t.title,
          platform: t.platform?.name ?? null,
          startedAt: t.startedAt,
        })),
      certificates: user.certificates.map((c) => {
        const daysLeft =
          c.expirationDate
            ? Math.ceil((c.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;
        return {
          ...c,
          isExpired: daysLeft !== null && daysLeft < 0,
          daysUntilExpiry: daysLeft !== null && daysLeft >= 0 ? daysLeft : null,
        };
      }),
      skills: user.skills,
    };
  }

  // ── Line alerts ───────────────────────────────────────────────────────────

  async getLineAlerts(managerId: string) {
    const lineId = await this.getManagerLineId(managerId);
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: { serviceLine: lineId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        userFunction: true,
        trainings: {
          select: { status: true, completedAt: true, startedAt: true },
        },
        certificates: {
          where: { status: 'COMPLETED', expirationDate: { not: null } },
          select: { courseName: true, expirationDate: true },
        },
      },
    });

    const certExpiryAlerts: {
      userId: string;
      userName: string;
      courseName: string;
      expirationDate: string;
      daysLeft: number;
      urgency: 'critical' | 'warning' | 'info';
    }[] = [];

    const inactiveUsers: {
      userId: string;
      userName: string;
      userFunction: string | null;
      lastActivityAt: string | null;
      daysSinceActivity: number | null;
      hasNoCompletions: boolean;
    }[] = [];

    const noTrainingUsers: typeof inactiveUsers = [];

    for (const u of users) {
      // Certificate expiry alerts
      for (const cert of u.certificates) {
        if (!cert.expirationDate) continue;
        const daysLeft = Math.ceil(
          (cert.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysLeft <= 90) {
          certExpiryAlerts.push({
            userId: u.id,
            userName: u.name ?? u.email,
            courseName: cert.courseName ?? 'Sem nome',
            expirationDate: cert.expirationDate.toISOString(),
            daysLeft,
            urgency: daysLeft <= 30 ? 'critical' : daysLeft <= 60 ? 'warning' : 'info',
          });
        }
      }

      // Inactivity alerts
      const completedDates = u.trainings
        .filter((t) => t.status === 'completed' && t.completedAt)
        .map((t) => t.completedAt!);
      const lastActivity = completedDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      if (!lastActivity || lastActivity < sixtyDaysAgo) {
        const daysSince = lastActivity
          ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        inactiveUsers.push({
          userId: u.id,
          userName: u.name ?? u.email,
          userFunction: u.userFunction,
          lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
          daysSinceActivity: daysSince,
          hasNoCompletions: completedDates.length === 0,
        });
      }

      // Users with zero trainings
      if (u.trainings.length === 0) {
        noTrainingUsers.push({
          userId: u.id,
          userName: u.name ?? u.email,
          userFunction: u.userFunction,
          lastActivityAt: null,
          daysSinceActivity: null,
          hasNoCompletions: true,
        });
      }
    }

    certExpiryAlerts.sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      summary: {
        certExpiryCritical: certExpiryAlerts.filter((a) => a.urgency === 'critical').length,
        certExpiryWarning: certExpiryAlerts.filter((a) => a.urgency === 'warning').length,
        certExpiryInfo: certExpiryAlerts.filter((a) => a.urgency === 'info').length,
        inactiveUsersCount: inactiveUsers.length,
        usersWithNoTrainingsCount: noTrainingUsers.length,
      },
      certExpiryAlerts,
      inactiveUsers,
      usersWithNoTrainings: noTrainingUsers,
    };
  }

  // ── Deprecated (kept for backwards compatibility) ────────────────────────

  async getUserProgress(managedLineId: ServiceLine, userId: string) {
    return this.getUserDetail(
      // resolve managerId from lineId is not possible here directly,
      // so we do the legacy check inline
      await this.prisma.user
        .findFirst({ where: { managedLineId, role: 'SERVICE_LINE_MANAGER' }, select: { id: true } })
        .then((u) => u?.id ?? userId),
      userId,
    );
  }

  // ── Activity feed ────────────────────────────────────────────────────────

  async getActivityFeed(managerId: string, limit = 30) {
    const lineId = await this.getManagerLineId(managerId);

    const members = await this.prisma.user.findMany({
      where: { serviceLine: lineId },
      select: { id: true, name: true, email: true },
    });
    const memberIds = members.map((m) => m.id);
    const memberMap = new Map(members.map((m) => [m.id, m.name ?? m.email]));

    const [trainings, certificates] = await Promise.all([
      this.prisma.trainingRecord.findMany({
        where: {
          userId: { in: memberIds },
          status: { in: ['completed', 'ongoing'] },
        },
        select: {
          userId: true,
          title: true,
          status: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit * 2,
      }),
      this.prisma.certificate.findMany({
        where: { userId: { in: memberIds }, status: 'COMPLETED' },
        select: {
          userId: true,
          courseName: true,
          completionDate: true,
          createdAt: true,
          training: { select: { title: true } },
        },
        orderBy: [{ completionDate: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
    ]);

    type ActivityEvent = {
      userId: string;
      userName: string;
      action: 'completed' | 'enrolled' | 'certificate';
      courseTitle: string;
      date: string;
    };

    const events: ActivityEvent[] = [];

    for (const t of trainings) {
      if (t.status === 'completed') {
        events.push({
          userId: t.userId,
          userName: memberMap.get(t.userId) ?? t.userId,
          action: 'completed',
          courseTitle: t.title,
          date: (t.completedAt ?? t.createdAt).toISOString(),
        });
      } else {
        events.push({
          userId: t.userId,
          userName: memberMap.get(t.userId) ?? t.userId,
          action: 'enrolled',
          courseTitle: t.title,
          date: t.createdAt.toISOString(),
        });
      }
    }

    for (const c of certificates) {
      events.push({
        userId: c.userId,
        userName: memberMap.get(c.userId) ?? c.userId,
        action: 'certificate',
        courseTitle: c.courseName ?? c.training?.title ?? 'Certificado',
        date: (c.completionDate ?? c.createdAt).toISOString(),
      });
    }

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events.slice(0, limit);
  }
}
