import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MetadataExtractionService } from '../../ai/extractors/metadata-extraction.service';
import axios from 'axios';
import { ProcessingStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

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

  async process(job: Job<any, any, string>): Promise<any> {
    const { certificateId, fileUrl, trainingTitle, originalName } = job.data;
    const jobId = job.id!;

    this.emitStatus(jobId, 'job_started', { certificateId });

    try {
      // 1. Obter idioma do utilizador
      const certData = await this.prisma.certificate.findUnique({
        where: { id: certificateId },
        select: { userId: true },
      });
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: certData?.userId },
      });
      const lang = settings?.uiLanguage || 'pt';

      // 2. Descarregar PDF do Supabase
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);

      this.emitStatus(jobId, 'pdf_downloaded', { size: buffer.length });

      // 3. Extração estruturada via IA (Nova Lógica Robusta)
      this.logger.log(`Iniciando extração IA para o certificado: ${certificateId}`);
      
      const extracted = await this.metadataExtractionService.extractCertificateMetadata(
        buffer, 
        trainingTitle, 
        originalName, 
        lang
      );

      this.emitStatus(jobId, 'ai_processed', { confidence: extracted.confidence });

      // 4. Atualizar DB com resultado final mapeado pelo Zod
      const updated = await this.prisma.certificate.update({
        where: { id: certificateId },
        data: {
          status: ProcessingStatus.COMPLETED,
          extractedMetadata: extracted as object,
          courseName: extracted.courseName || undefined,
          provider: extracted.institution || undefined, // Mapeado de institution para provider na DB
          completionDate: extracted.date ? (isNaN(Date.parse(extracted.date)) ? undefined : new Date(extracted.date)) : undefined,
        },
      });

      this.emitStatus(jobId, 'completed', { certificateId, metadata: extracted });
      return updated;

    } catch (error) {
      this.logger.error(`Erro no processamento do certificate ${certificateId}: ${error.message}`);
      this.emitStatus(jobId, 'failed', { error: error.message });

      await this.prisma.certificate.update({
        where: { id: certificateId },
        data: { 
          status: ProcessingStatus.FAILED,
          errorMessage: error.message 
        },
      });

      throw error;
    }
  }
}
