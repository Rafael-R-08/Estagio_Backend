import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateAdminPlatformDto } from './dto/update-admin-platform.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) { }

  // ── Users ────────────────────────────────────────────────────────────────

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        experienceLevel: true,
        jobTitle: true,
        department: true,
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
        techStack: true,
        interests: true,
        jobTitle: true,
        department: true,
        location: true,
        preferredLanguage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    return user;
  }

  async updateUser(id: string, dto: UpdateAdminUserDto) {
    await this.getUser(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  async deleteUser(id: string) {
    await this.getUser(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Utilizador eliminado com sucesso' };
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics() {
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [completedTrainings, allTrainings, allUsers, expiringCerts] =
      await Promise.all([
        this.prisma.trainingRecord.findMany({
          where: { status: 'completed', completedAt: { not: null } },
          select: { completedAt: true, platform: { select: { name: true } } },
        }),
        this.prisma.trainingRecord.findMany({
          where: { platformId: { not: null } },
          select: { platform: { select: { name: true } } },
        }),
        this.prisma.user.findMany({
          select: { createdAt: true, techStack: true },
          orderBy: { createdAt: 'asc' },
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
      ]);

    // completedByMonth
    const completedMap = new Map<string, number>();
    for (const t of completedTrainings) {
      if (!t.completedAt) continue;
      const key = `${t.completedAt.getFullYear()}-${String(t.completedAt.getMonth() + 1).padStart(2, '0')}`;
      completedMap.set(key, (completedMap.get(key) ?? 0) + 1);
    }
    const completedByMonth = [...completedMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // platformUsage
    const platformMap = new Map<string, number>();
    for (const t of allTrainings) {
      const name = t.platform?.name ?? 'Outro';
      platformMap.set(name, (platformMap.get(name) ?? 0) + 1);
    }
    const platformUsage = [...platformMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    // userGrowth — cumulative count per month
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

    // topSkills
    const skillMap = new Map<string, number>();
    for (const u of allUsers) {
      for (const skill of u.techStack ?? []) {
        skillMap.set(skill, (skillMap.get(skill) ?? 0) + 1);
      }
    }
    const topSkills = [...skillMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));

    // expiringCertificates
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
      completedByMonth,
      platformUsage,
      userGrowth,
      topSkills,
      expiringCertificates,
    };
  }

  // ── Platforms ────────────────────────────────────────────────────────────

  async getPlatforms() {
    const platforms = await this.prisma.learningPlatform.findMany({
      orderBy: { name: 'asc' },
    });
    return platforms.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      apiEndpoint: p.apiEndpoint,
      apiKeyRequired: p.apiKeyRequired,
      isActive: p.enabled,
      isSearchEnabled: p.searchEnabled,
      // apiKey is omitted from list to avoid leaking secrets
    }));
  }

  async updatePlatform(id: string, dto: UpdateAdminPlatformDto) {
    const platform = await this.prisma.learningPlatform.findUnique({
      where: { id },
    });
    if (!platform) throw new NotFoundException('Plataforma não encontrada');

    const { isActive, isSearchEnabled, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (isActive !== undefined) data.enabled = isActive;
    if (isSearchEnabled !== undefined) data.searchEnabled = isSearchEnabled;

    const updated = await this.prisma.learningPlatform.update({
      where: { id },
      data,
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
