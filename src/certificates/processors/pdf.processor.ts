import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MetadataExtractionService } from '../../ai/extractors/metadata-extraction.service';
import axios from 'axios';
import { ProcessingStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CertificateProcessedEvent } from '../../notifications/events/certificate-processed.event';

@Processor('pdf-processing', {
  concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '2', 10),
})
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metadataExtractionService: MetadataExtractionService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  private emitStatus(jobId: string, status: string, data?: any) {
    this.eventEmitter.emit(`job.${jobId}.status`, {
      jobId, status, timestamp: new Date().toISOString(), ...data
    });
  }

  private toSafeDate(value: string | null | undefined): Date | undefined {
    if (!value) return undefined;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return undefined;
    return new Date(parsed);
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { certificateId, fileUrl, trainingTitle, originalName, mimeType } = job.data;
    const jobId = job.id!;

    this.emitStatus(jobId, 'job_started', { certificateId });

    try {
      // 1. Obter idioma do utilizador
      const certData = await this.prisma.certificate.findUnique({
        where: { id: certificateId },
        select: { userId: true, trainingId: true },
      });
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: certData?.userId },
      });
      const lang = settings?.uiLanguage || 'pt';

      // 2. Descarregar ficheiro do Supabase
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const contentType = String(response.headers?.['content-type'] || mimeType || '');

      this.emitStatus(jobId, 'file_downloaded', { size: buffer.length, contentType });

      // 3. Extração estruturada via IA (Nova Lógica Robusta)
      this.logger.log(`Iniciando extração IA para o certificado: ${certificateId}`);
      
      const extracted = await this.metadataExtractionService.extractCertificateMetadata(
        buffer, 
        trainingTitle, 
        originalName, 
        lang,
        contentType,
      );

      this.emitStatus(jobId, 'ai_processed', { confidence: extracted.confidence });

      // 4. Atualizar DB com resultado final mapeado pelo Zod (usando transação para TrainingRecord)
      const completionDate = this.toSafeDate(extracted.date);
      let expirationDate = this.toSafeDate(extracted.expirationDate);

      // Opção B: Fallback de 2 anos se a IA não detetar expiração mas houver data de conclusão
      if (!expirationDate && completionDate) {
        expirationDate = new Date(completionDate);
        expirationDate.setFullYear(expirationDate.getFullYear() + 2);
        this.logger.log(`Data de expiração calculada (padrão 2 anos): ${expirationDate.toISOString()}`);
      }

      const [updated] = await this.prisma.$transaction([
        this.prisma.certificate.update({
          where: { id: certificateId },
          data: {
            status: ProcessingStatus.COMPLETED,
            extractedMetadata: extracted as object,
            courseName: extracted.courseName || trainingTitle || undefined,
            provider: extracted.institution || undefined,
            completionDate,
            expirationDate,
            durationHours: extracted.durationHours || undefined,
          },
        }),
        this.prisma.trainingRecord.update({
          where: { id: certData!.trainingId },
          data: {
            durationHours: extracted.durationHours || undefined,
            completedAt: completionDate,
          }
        })
      ]);

      this.emitStatus(jobId, 'completed', { certificateId, metadata: extracted });
      this.eventEmitter.emit(
        'certificate.processed',
        new CertificateProcessedEvent(
          certificateId,
          certData!.userId,
          updated.courseName ?? trainingTitle ?? '',
          ProcessingStatus.COMPLETED,
        ),
      );
      return updated;

    } catch (error) {
      this.logger.error(`Erro no processamento do certificate ${certificateId}: ${error.message}`);
      this.emitStatus(jobId, 'failed', { error: error.message });

      const failedCert = await this.prisma.certificate.update({
        where: { id: certificateId },
        data: { 
          status: ProcessingStatus.FAILED,
          errorMessage: error.message 
        },
      });
      this.eventEmitter.emit(
        'certificate.processed',
        new CertificateProcessedEvent(
          certificateId,
          failedCert.userId,
          failedCert.courseName ?? trainingTitle ?? '',
          ProcessingStatus.FAILED,
          error.message,
        ),
      );

      throw error;
    }
  }
}
