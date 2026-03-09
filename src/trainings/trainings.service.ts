import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { FilterTrainingDto } from './dto/filter-training.dto';
import { TrainingStatus } from '@prisma/client';

@Injectable()
export class TrainingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTrainingDto) {
    return this.prisma.trainingRecord.create({
      data: {
        userId,
        title: dto.title,
        url: dto.url,
        status: dto.status,
        platformId: dto.platformId ?? null,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
        durationHours: dto.durationHours ?? null,
        notes: dto.notes ?? null,
        rating: dto.rating ?? null,
      },
      include: { platform: { select: { id: true, name: true } } },
    });
  }

  async findAll(userId: string, filters: FilterTrainingDto) {
    const where: Record<string, unknown> = { userId };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.platformId) {
      where.platformId = filters.platformId;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }

    return this.prisma.trainingRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { platform: { select: { id: true, name: true } } },
    });
  }

  async findOne(userId: string, id: string) {
    const record = await this.prisma.trainingRecord.findUnique({
      where: { id },
      include: {
        platform: { select: { id: true, name: true } },
        certificate: true,
      },
    });

    if (!record) throw new NotFoundException('Registo de formação não encontrado.');
    if (record.userId !== userId) throw new ForbiddenException('Sem permissão para aceder a este registo.');

    return record;
  }

  async update(userId: string, id: string, dto: UpdateTrainingDto) {
    await this.findOne(userId, id); // verifica existência e ownership

    return this.prisma.trainingRecord.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.url && { url: dto.url }),
        ...(dto.status && { status: dto.status }),
        ...(dto.platformId !== undefined && { platformId: dto.platformId }),
        ...(dto.startedAt !== undefined && { startedAt: dto.startedAt ? new Date(dto.startedAt) : null }),
        ...(dto.completedAt !== undefined && { completedAt: dto.completedAt ? new Date(dto.completedAt) : null }),
        ...(dto.durationHours !== undefined && { durationHours: dto.durationHours }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
      },
      include: { platform: { select: { id: true, name: true } } },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id); // verifica existência e ownership
    await this.prisma.trainingRecord.delete({ where: { id } });
    return { message: 'Registo eliminado com sucesso.' };
  }

  async getStats(userId: string) {
    const records = await this.prisma.trainingRecord.findMany({
      where: { userId },
      select: {
        status: true,
        durationHours: true,
        rating: true,
        completedAt: true,
      },
    });

    const total = records.length;
    const byStatus = Object.values(TrainingStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<TrainingStatus, number>,
    );
    records.forEach((r) => { byStatus[r.status]++; });

    const hoursRecords = records.filter((r) => r.durationHours !== null);
    const totalHours = hoursRecords.reduce((sum, r) => sum + (r.durationHours ?? 0), 0);

    const ratingRecords = records.filter((r) => r.rating !== null);
    const avgRating =
      ratingRecords.length > 0
        ? ratingRecords.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratingRecords.length
        : null;

    const now = new Date();
    const completedThisMonth = records.filter((r) => {
      if (!r.completedAt) return false;
      const d = new Date(r.completedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const completedThisYear = records.filter((r) => {
      if (!r.completedAt) return false;
      return new Date(r.completedAt).getFullYear() === now.getFullYear();
    }).length;

    return {
      total,
      byStatus,
      totalHours,
      avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
      completedThisMonth,
      completedThisYear,
    };
  }
}
