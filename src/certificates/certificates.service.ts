import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/services/ai.service';
import { SupabaseStorageService } from './supabase-storage.service';

import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { basename } from 'path';
import axios from 'axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProcessingStatus } from '@prisma/client';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly supabaseStorage: SupabaseStorageService,
    @InjectQueue('pdf-processing') private readonly pdfQueue: Queue,
  ) {}

  async create(
    userId: string,
    file: Express.Multer.File,
    dto: CreateCertificateDto,
  ) {
    const training = await this.prisma.trainingRecord.findUnique({
      where: { id: dto.trainingId },
    });
    if (!training) throw new NotFoundException('Registo de formação não encontrado.');
    if (training.userId !== userId) throw new ForbiddenException('Sem permissão.');

    const existing = await this.prisma.certificate.findUnique({
      where: { trainingId: dto.trainingId },
    });
    if (existing) throw new BadRequestException('Já existe um certificado para esta formação.');

    const fileUrl = await this.supabaseStorage.uploadFile({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
    });

    // 1. Criar o registo com status PENDING
    const certificate = await this.prisma.certificate.create({
      data: {
        trainingId: dto.trainingId,
        userId,
        fileUrl,
        courseName: dto.courseName || training.title,
        provider: dto.provider || null,
        status: ProcessingStatus.PENDING,
      },
      include: {
        training: { select: { id: true, title: true, status: true } },
      },
    });

    // 2. Adicionar o job à fila
    const job = await this.pdfQueue.add('process-pdf', {
      certificateId: certificate.id,
      fileUrl,
      trainingTitle: training.title,
      originalName: file.originalname,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    // 3. Guardar o jobId para tracking
    return this.prisma.certificate.update({
      where: { id: certificate.id },
      data: { jobId: job.id },
      include: {
        training: { select: { id: true, title: true, status: true } },
      },
    });
  }

  async getJobStatus(jobId: string) {
    const job = await this.pdfQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Fila de processamento não encontrada.');
    
    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      id: job.id,
      state,
      progress,
      result,
      failedReason,
    };
  }

  async findAll(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        training: { select: { id: true, title: true, url: true, status: true } },
      },
    });
  }

  async findExpiring(userId: string, days = 30) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.certificate.findMany({
      where: {
        userId,
        expirationDate: { gte: now, lte: future },
      },
      orderBy: { expirationDate: 'asc' },
      include: {
        training: { select: { id: true, title: true, url: true, status: true } },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        training: { select: { id: true, title: true, url: true, status: true } },
      },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado.');
    if (cert.userId !== userId) throw new ForbiddenException('Sem permissão.');
    return cert;
  }

  async remove(userId: string, id: string) {
    const cert = await this.findOne(userId, id);
    await this.supabaseStorage.deleteFile(cert.fileUrl);
    await this.prisma.certificate.delete({ where: { id } });
    return { message: 'Certificado eliminado com sucesso.' };
  }

  async reextract(userId: string, id: string) {
    const cert = await this.findOne(userId, id);
    const training = await this.prisma.trainingRecord.findUnique({
      where: { id: cert.trainingId },
    });

    // 1. Marcar como PENDING novamente
    await this.prisma.certificate.update({
      where: { id },
      data: { status: ProcessingStatus.PENDING, errorMessage: null },
    });

    // 2. Adicionar à fila
    const job = await this.pdfQueue.add('process-pdf', {
      certificateId: cert.id,
      fileUrl: cert.fileUrl,
      trainingTitle: training?.title || cert.courseName || 'Certificate',
      originalName: basename(cert.fileUrl),
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    // 3. Atualizar com novo jobId
    return this.prisma.certificate.update({
      where: { id },
      data: { jobId: job.id },
    });
  }



  async update(userId: string, id: string, dto: UpdateCertificateDto) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException('Certificado não encontrado.');
    if (cert.userId !== userId) throw new ForbiddenException('Sem permissão.');

    return this.prisma.certificate.update({
      where: { id },
      data: {
        ...(dto.courseName !== undefined && { courseName: dto.courseName }),
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.completionDate !== undefined && { completionDate: new Date(dto.completionDate) }),
        ...(dto.expirationDate !== undefined && { expirationDate: new Date(dto.expirationDate) }),
      },
      include: { training: { select: { id: true, title: true, url: true, status: true } } },
    });
  }

  async getRenewalAlerts(userId: string) {
    const now = new Date();
    const monthsAdvance = 6; // Default period since preferences are gone
    
    const alertThresholdDate = new Date();
    alertThresholdDate.setMonth(now.getMonth() + monthsAdvance);

    const expiringCerts = await this.prisma.certificate.findMany({
      where: {
        userId,
        expirationDate: {
          not: null,
          gte: now,
          lte: alertThresholdDate,
        },
      },
      include: { training: true },
    });

    const staleMonths = 24; 
    const staleThresholdDate = new Date();
    staleThresholdDate.setMonth(now.getMonth() - staleMonths);

    const oldKnowledgeCerts = await this.prisma.certificate.findMany({
      where: {
        userId,
        expirationDate: null,
        completionDate: {
          not: null,
          lte: staleThresholdDate,
        },
      },
      include: { training: true },
    });

    return {
      expiringAlerts: expiringCerts.map(c => ({
        certificateId: c.id,
        courseName: c.courseName || c.training.title,
        expirationDate: c.expirationDate,
        daysRemaining: Math.ceil((c.expirationDate!.getTime() - now.getTime()) / (1000 * 3600 * 24)),
        message: `A certificação em "${c.courseName || c.training.title}" expira em breve!`,
      })),
      staleKnowledgeSuggestions: oldKnowledgeCerts.map(c => ({
        certificateId: c.id,
        courseName: c.courseName || c.training.title,
        completionDate: c.completionDate,
        monthsSinceCompletion: Math.floor((now.getTime() - c.completionDate!.getTime()) / (1000 * 3600 * 24 * 30)),
        message: `Concluíste "${c.courseName || c.training.title}" há mais de ${staleMonths} meses. Considera atualizar os teus conhecimentos.`,
      })),
    };
  }
}
