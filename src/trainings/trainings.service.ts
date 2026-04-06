// src/trainings/trainings.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { FilterTrainingDto } from './dto/filter-training.dto';
import { TrackAccessDto } from './dto/track-access.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { TrainingStatus } from '@prisma/client';
import { SupabaseStorageService } from '../certificates/supabase-storage.service';
import { TrainingCompletedEvent, TrainingCreatedEvent } from '../notifications/events/training.events';

@Injectable()
export class TrainingsService {
  constructor(
    public readonly prisma: PrismaService,
    private readonly storageService: SupabaseStorageService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async create(userId: string, dto: CreateTrainingDto) {
    const record = await this.prisma.trainingRecord.create({
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

    // Notify when a training is explicitly added to the plan (not passive access tracking)
    if (dto.status !== TrainingStatus.accessed) {
      this.eventEmitter.emit(
        'training.created',
        new TrainingCreatedEvent(record.id, userId, record.title),
      );
    }

    // Notify immediately if created already as completed
    if (dto.status === TrainingStatus.completed) {
      this.eventEmitter.emit(
        'training.completed',
        new TrainingCompletedEvent(record.id, userId, record.title, record.completedAt ?? new Date()),
      );
    }

    return record;
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
        resources: { include: { files: true }, orderBy: { position: 'asc' } },
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
        resources: { include: { files: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!record) throw new NotFoundException('Registo de formação não encontrado.');
    if (record.userId !== userId) throw new ForbiddenException('Sem permissão.');
    return record;
  }

  async update(userId: string, id: string, dto: UpdateTrainingDto) {
    const existing = await this.findOne(userId, id);
    const updated = await this.prisma.trainingRecord.update({
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
        documents: true,
        resources: { include: { files: true }, orderBy: { position: 'asc' } }
      },
    });

    // Emit training.completed only on the transition to 'completed'
    if (
      dto.status === TrainingStatus.completed &&
      existing.status !== TrainingStatus.completed
    ) {
      this.eventEmitter.emit(
        'training.completed',
        new TrainingCompletedEvent(id, userId, updated.title, updated.completedAt ?? new Date()),
      );
    }

    return updated;
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

    if (doc.fileUrl) {
      await this.storageService.deleteFile(doc.fileUrl, 'docs');
    }

    await this.prisma.trainingDocument.delete({ where: { id: documentId } });
    return { message: 'Documento removido.' };
  }


  // --- Resource Management (Trello Board) ---

  async addResource(userId: string, trainingId: string, dto: CreateResourceDto, files?: { fileUrl: string; fileName: string }[]) {
    await this.findOne(userId, trainingId);
    return this.prisma.trainingResource.create({
      data: {
        trainingId,
        title: dto.title,
        content: dto.content ?? '',
        position: dto.position ?? 0,
        ...(files && files.length > 0 ? {
          files: {
            create: files.map(f => ({
              fileUrl: f.fileUrl,
              fileName: f.fileName
            }))
          }
        } : {})
      },
      include: { files: true }
    });
  }

  async updateResource(userId: string, trainingId: string, resourceId: string, dto: UpdateResourceDto) {
    await this.findOne(userId, trainingId);
    const resource = await this.prisma.trainingResource.findUnique({ where: { id: resourceId } });
    if (!resource || resource.trainingId !== trainingId) throw new NotFoundException('Recurso não encontrado.');

    return this.prisma.trainingResource.update({
      where: { id: resourceId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
      include: { files: true }
    });
  }

  async removeResource(userId: string, trainingId: string, resourceId: string) {
    await this.findOne(userId, trainingId);
    const resource = await this.prisma.trainingResource.findUnique({
      where: { id: resourceId },
      include: { files: true }
    });
    if (!resource || resource.trainingId !== trainingId) throw new NotFoundException('Recurso não encontrado.');

    for (const file of resource.files) {
      if (file.fileUrl) {
        await this.storageService.deleteFile(file.fileUrl, 'docs');
      }
    }

    await this.prisma.trainingResource.delete({ where: { id: resourceId } });
    return { message: 'Recurso removido.' };
  }

  async addResourceFile(userId: string, trainingId: string, resourceId: string, fileUrl: string, fileName: string) {
    await this.findOne(userId, trainingId);
    const resource = await this.prisma.trainingResource.findUnique({ where: { id: resourceId } });
    if (!resource || resource.trainingId !== trainingId) throw new NotFoundException('Recurso não encontrado.');

    return this.prisma.resourceFile.create({
      data: {
        resourceId,
        fileUrl,
        fileName,
      }
    });
  }

  async removeResourceFile(userId: string, trainingId: string, resourceId: string, fileId: string) {
    await this.findOne(userId, trainingId);
    const file = await this.prisma.resourceFile.findUnique({ where: { id: fileId } });
    if (!file || file.resourceId !== resourceId) throw new NotFoundException('Ficheiro não encontrado.');

    if (file.fileUrl) {
      await this.storageService.deleteFile(file.fileUrl, 'docs');
    }
    await this.prisma.resourceFile.delete({ where: { id: fileId } });
    return { message: 'Ficheiro removido.' };
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
