import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProgressReport(userId: string) {
    const now = new Date();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        userFunction: true,
        experienceLevel: true,
        serviceLine: true,
        interests: true,
        createdAt: true,
        onboardingDone: true,
        trainings: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            url: true,
            status: true,
            startedAt: true,
            completedAt: true,
            durationHours: true,
            rating: true,
            relevance: true,
            progressLevel: true,
            platform: { select: { name: true } },
            certificate: { select: { id: true } },
          },
        },
        certificates: {
          where: { status: 'COMPLETED' },
          orderBy: { completionDate: 'desc' },
          select: {
            id: true,
            courseName: true,
            provider: true,
            completionDate: true,
            expirationDate: true,
            fileUrl: true,
          },
        },
        skills: {
          orderBy: { createdAt: 'desc' },
          select: { skillName: true, level: true, createdAt: true },
        },
        settings: {
          select: { uiLanguage: true },
        },
      },
    });

    if (!user) return null;

    const completed = user.trainings.filter((t) => t.status === 'completed');
    const ongoing = user.trainings.filter((t) => t.status === 'ongoing');

    const totalHours = completed.reduce((sum, t) => sum + (t.durationHours ?? 0), 0);

    const ratedTrainings = completed.filter((t) => t.rating != null);
    const avgRating =
      ratedTrainings.length > 0
        ? ratedTrainings.reduce((sum, t) => sum + t.rating!, 0) / ratedTrainings.length
        : null;

    const relevantTrainings = completed.filter((t) => t.relevance != null);
    const avgRelevance =
      relevantTrainings.length > 0
        ? relevantTrainings.reduce((sum, t) => sum + t.relevance!, 0) / relevantTrainings.length
        : null;

    return {
      generatedAt: now.toISOString(),
      user: {
        name: user.name,
        email: user.email,
        serviceLine: user.serviceLine,
        memberSince: user.createdAt.toISOString(),
        skills: user.skills.map((s) => ({ name: s.skillName, level: s.level })),
      },
      stats: {
        totalCompleted: completed.length,
        totalHours: Math.round(totalHours * 10) / 10,
        avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
        avgRelevance: avgRelevance !== null ? Math.round(avgRelevance * 10) / 10 : null,
        totalCertificates: user.certificates.length,
      },
      completedTrainings: completed.map((t) => ({
        id: t.id,
        title: t.title,
        platform: t.platform?.name ?? null,
        durationHours: t.durationHours ?? null,
        rating: t.rating ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        hasCertificate: t.certificate != null,
      })),
      ongoingTrainings: ongoing.map((t) => ({
        id: t.id,
        title: t.title,
        platform: t.platform?.name ?? null,
        startedAt: t.startedAt?.toISOString() ?? null,
      })),
      certificates: user.certificates.map((c) => ({
        id: c.id,
        courseName: c.courseName ?? null,
        provider: c.provider ?? null,
        completionDate: c.completionDate?.toISOString() ?? null,
        expirationDate: c.expirationDate?.toISOString() ?? null,
        isExpired: c.expirationDate != null && c.expirationDate <= now,
        fileUrl: c.fileUrl,
      })),
    };
  }
}
