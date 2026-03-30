// src/trainings/trainings.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { FilterTrainingDto } from './dto/filter-training.dto';
import { TrackAccessDto } from './dto/track-access.dto';
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
        rating: dto.rating ?? null,
        relevance: dto.relevance ?? null,
        notes: dto.notes ?? null,
        progressLevel: dto.progressLevel ?? null,
        priorityOrder: dto.priorityOrder ?? null,
      },
      include: { platform: { select: { id: true, name: true } } },
    });
  }

  async trackAccess(userId: string, dto: TrackAccessDto) {
    const existing = await this.prisma.trainingRecord.findFirst({
      where: { userId, url: dto.url },
    });

    if (existing) return existing; 

    return this.prisma.trainingRecord.create({
      data: {
        userId,
        title: dto.title,
        url: dto.url,
        platformId: dto.platformId ?? null,
        status: TrainingStatus.accessed,
      },
      include: { platform: { select: { id: true, name: true } } },
    });
  }

  async addToPlan(userId: string, dto: TrackAccessDto) {
    const existing = await this.prisma.trainingRecord.findFirst({
      where: { userId, url: dto.url },
    });

    if (existing) {
      if (existing.status === TrainingStatus.priority) return existing;
      return this.update(userId, existing.id, { status: TrainingStatus.priority });
    }

    return this.prisma.trainingRecord.create({
      data: {
        userId,
        title: dto.title,
        url: dto.url,
        platformId: dto.platformId ?? null,
        status: TrainingStatus.priority,
      },
    });
  }

  async startTraining(userId: string, dto: TrackAccessDto) {
    const existing = await this.prisma.trainingRecord.findFirst({
      where: { userId, url: dto.url },
    });

    if (existing) {
      if (existing.status === TrainingStatus.ongoing) return existing;
      return this.update(userId, existing.id, { 
        status: TrainingStatus.ongoing, 
        startedAt: new Date().toISOString(),
        progressLevel: 'A iniciar'
      });
    }

    return this.prisma.trainingRecord.create({
      data: {
        userId,
        title: dto.title,
        url: dto.url,
        platformId: dto.platformId ?? null,
        status: TrainingStatus.ongoing,
        startedAt: new Date(),
        progressLevel: 'A iniciar'
      },
    });
  }

  async getPendingFeedback(userId: string) {
    return this.prisma.trainingRecord.findMany({
      where: { userId, status: TrainingStatus.accessed },
      orderBy: { createdAt: 'desc' },
      include: { platform: { select: { id: true, name: true } } },
    });
  }

  async findAll(userId: string, filters: FilterTrainingDto) {
    const where: any = { userId };
    if (filters.status) where.status = filters.status;
    if (filters.platformId) where.platformId = filters.platformId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }

    return this.prisma.trainingRecord.findMany({
      where,
      orderBy: [
        { priorityOrder: 'asc' },
        { createdAt: 'desc' }
      ],
      include: { 
        platform: { select: { id: true, name: true } },
        documents: true,
        certificate: { select: { id: true, fileUrl: true } }
      },
    });
  }

  async findOne(userId: string, id: string) {
    const record = await this.prisma.trainingRecord.findUnique({
      where: { id },
      include: {
        platform: { select: { id: true, name: true } },
        certificate: true,
        documents: true,
      },
    });
    if (!record) throw new NotFoundException('Registo de formação não encontrado.');
    if (record.userId !== userId) throw new ForbiddenException('Sem permissão.');
    return record;
  }

  async update(userId: string, id: string, dto: UpdateTrainingDto) {
    await this.findOne(userId, id);
    return this.prisma.trainingRecord.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.url && { url: dto.url }),
        ...(dto.status && { status: dto.status }),
        ...(dto.platformId !== undefined && { platformId: dto.platformId }),
        ...(dto.startedAt !== undefined && { startedAt: dto.startedAt ? new Date(dto.startedAt) : null }),
        ...(dto.completedAt !== undefined && { completedAt: dto.completedAt ? new Date(dto.completedAt) : null }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.relevance !== undefined && { relevance: dto.relevance }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.progressLevel !== undefined && { progressLevel: dto.progressLevel }),
        ...(dto.priorityOrder !== undefined && { priorityOrder: dto.priorityOrder }),
      },
      include: { 
        platform: { select: { id: true, name: true } },
        documents: true 
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.trainingRecord.delete({ where: { id } });
    return { message: 'Registo eliminado com sucesso.' };
  }

  // --- Document Management ---

  async addDocument(userId: string, trainingId: string, fileUrl: string, fileName: string) {
    await this.findOne(userId, trainingId);
    return this.prisma.trainingDocument.create({
      data: {
        trainingId,
        fileUrl,
        fileName,
      }
    });
  }

  async removeDocument(userId: string, trainingId: string, documentId: string) {
    await this.findOne(userId, trainingId);
    const doc = await this.prisma.trainingDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.trainingId !== trainingId) throw new NotFoundException('Documento não encontrado.');
    
    await this.prisma.trainingDocument.delete({ where: { id: documentId } });
    return { message: 'Documento removido.' };
  }

  async getStats(userId: string) {
    const records = await this.prisma.trainingRecord.findMany({
      where: { userId },
      select: {
        status: true,
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

    return {
      total,
      byStatus,
      avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
      completedThisMonth,
    };
  }
}
