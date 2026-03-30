import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../../ai/services/ai.service';
import { buildCertificateExtractionPrompt } from '../../ai/templates/certificate.template';
import axios from 'axios';
import { ProcessingStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PdfService } from '../pdf.service';

@Processor('pdf-processing', {
  concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '2', 10),
  lockDuration: 300000, // 5 minutos para PDFs pesados
  stalledInterval: 30000, // 30 segundos para check de saúde
})
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pdfService: PdfService,
  ) {
    super();
  }

  private emitStatus(jobId: string, status: string, data?: any) {
    this.eventEmitter.emit(`job.${jobId}.status`, {
      jobId,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { certificateId, fileUrl, trainingTitle, originalName } = job.data;
    const jobId = job.id!;

    this.emitStatus(jobId, 'job_started', { certificateId });

    try {
      // 2. Obter idioma do utilizador (via certificado)
      const certData = await this.prisma.certificate.findUnique({
        where: { id: certificateId },
        select: { userId: true },
      });
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: certData?.userId },
      });
      const lang = settings?.uiLanguage || 'pt';

      // 3. Descarregar PDF do Supabase
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const mimetype = response.headers['content-type'] || 'application/pdf';

      this.emitStatus(jobId, 'pdf_downloaded', { size: buffer.length });

      // 4. Extrair texto usando o PdfService (Isolado)
      let extractedText = '';
      if (mimetype.includes('pdf')) {
        extractedText = await this.pdfService.extractText(buffer);
      }

      // 5. Analisar via AI
      const prompt = buildCertificateExtractionPrompt(
        trainingTitle,
        originalName,
        extractedText,
        lang,
        {}
      );

      let aiResponse: string;
      const genOptions = {
        temperature: 0.1,
        topP: 0.9,
        language: lang as 'pt' | 'en',
        responseFormat: 'json_object' as const,
      };

      if (extractedText) {
        aiResponse = await this.aiService.generateText(prompt, genOptions);
      } else {
        aiResponse = await this.aiService.analyzeDocument(buffer, prompt, genOptions);
      }

      this.emitStatus(jobId, 'ai_processed');

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : { confidence: 'low' };

      // 5. Atualizar DB com resultado final
      const updated = await this.prisma.certificate.update({
        where: { id: certificateId },
        data: {
          status: ProcessingStatus.COMPLETED,
          extractedMetadata: extracted as object,
          courseName: extracted.courseName || undefined,
          provider: extracted.provider || undefined,
          completionDate: extracted.completionDate ? new Date(extracted.completionDate) : undefined,
          expirationDate: extracted.expirationDate ? new Date(extracted.expirationDate) : undefined,
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
