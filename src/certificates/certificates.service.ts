import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AzureBlobService } from './azure-blob.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { basename } from 'path';
import axios from 'axios';
import * as Tesseract from 'tesseract.js';
const pdfParse = require('pdf-parse');

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly azureBlob: AzureBlobService,
  ) {}

  async create(
    userId: string,
    file: Express.Multer.File,
    dto: CreateCertificateDto,
  ) {
    // Verificar se o training existe e pertence ao utilizador
    const training = await this.prisma.trainingRecord.findUnique({
      where: { id: dto.trainingId },
    });
    if (!training) throw new NotFoundException('Registo de formação não encontrado.');
    if (training.userId !== userId) throw new ForbiddenException('Sem permissão.');

    // Verificar se já existe certificado para este training
    const existing = await this.prisma.certificate.findUnique({
      where: { trainingId: dto.trainingId },
    });
    if (existing) throw new BadRequestException('Já existe um certificado para esta formação.');

    // Upload para Azure Blob Storage
    const fileUrl = await this.azureBlob.uploadFile({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
    });

    // Extrair metadados com IA
    const extracted = await this.extractMetadataWithAI(
      training.title,
      file.originalname,
      dto,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.certificate.create({
      data: {
        trainingId: dto.trainingId,
        userId,
        fileUrl,
        courseName: dto.courseName || extracted.courseName || training.title,
        provider: dto.provider || extracted.provider || null,
        completionDate: dto.completionDate
          ? new Date(dto.completionDate)
          : extracted.completionDate
            ? new Date(extracted.completionDate)
            : null,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : extracted.expirationDate
            ? new Date(extracted.expirationDate)
            : null,
        durationHours: dto.durationHours || extracted.durationHours || training.durationHours || null,
        extractedMetadata: extracted as object,
      },
      include: {
        training: { select: { id: true, title: true, status: true } },
      },
    });
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

    // Apagar ficheiro do Azure Blob Storage
    await this.azureBlob.deleteFile(cert.fileUrl);

    await this.prisma.certificate.delete({ where: { id } });
    return { message: 'Certificado eliminado com sucesso.' };
  }

  async reextract(userId: string, id: string) {
    const cert = await this.findOne(userId, id);
    const training = await this.prisma.trainingRecord.findUnique({
      where: { id: cert.trainingId },
    });

    let buffer: Buffer | undefined;
    let mimetype: string | undefined;

    try {
      const response = await axios.get(cert.fileUrl, { responseType: 'arraybuffer' });
      buffer = Buffer.from(response.data);
      mimetype = response.headers['content-type'];
    } catch (e) {
      this.logger.warn(`Failed to remotely download cert file for reextraction: ${e}`);
    }

    const extracted = await this.extractMetadataWithAI(
      training?.title || cert.courseName || '',
      basename(cert.fileUrl),
      {},
      buffer,
      mimetype,
    );

    return this.prisma.certificate.update({
      where: { id },
      data: { extractedMetadata: extracted as object },
    });
  }

  // ---- Extração de metadados com Ollama & OCR ----
  private async extractMetadataWithAI(
    courseTitle: string,
    filename: string,
    hints: Partial<CreateCertificateDto>,
    fileBuffer?: Buffer,
    mimetype?: string,
  ): Promise<{
    courseName?: string;
    provider?: string;
    completionDate?: string;
    expirationDate?: string;
    durationHours?: number;
    confidence: string;
  }> {
    try {
      let documentExtraText = '';

      if (fileBuffer && mimetype) {
        try {
          if (mimetype === 'application/pdf') {
            const pdfData = await pdfParse(fileBuffer);
            documentExtraText = pdfData.text;
          } else if (mimetype.startsWith('image/')) {
            const result = await Tesseract.recognize(fileBuffer, 'eng+por', { logger: () => {} });
            documentExtraText = result.data.text;
          }
        } catch (e) {
          this.logger.warn('Falha na extração de texto OCR/PDF: ' + e);
        }
      }

      if (documentExtraText.length > 2500) {
        documentExtraText = documentExtraText.substring(0, 2500);
      }

      const prompt = `Analisa as informações do certificado e extrai os metadados em JSON. Baseia-te preferencialmente no conteúdo extraído do próprio documento.

Título da Formação Esperada: "${courseTitle}"
Nome do Ficheiro Original: "${filename}"
${hints.courseName ? `Nome fornecido pelo utilizador: "${hints.courseName}"` : ''}
${hints.provider ? `Fornecedor: "${hints.provider}"` : ''}

=== CONTEÚDO EXTRAÍDO DO DOCUMENTO (VIA OCR) ===
${documentExtraText ? documentExtraText : '(sem conteúdo extraído, faz o teu melhor com os nomes)'}
================================================

Responde APENAS com um JSON válido com estes campos (usa null se não conseguires determinar):
{
  "courseName": "nome completo do curso",
  "provider": "empresa/plataforma que emitiu (ex: Microsoft, Salesforce, IBM, Udemy)",
  "completionDate": "data ISO 8601 ou null",
  "expirationDate": "data ISO 8601 ou null",
  "durationHours": número ou null,
  "confidence": "high|medium|low"
}`;

      const response = await this.aiService.generateText(prompt);

      // Extrair JSON da resposta
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { confidence: 'low' };

      const parsed = JSON.parse(jsonMatch[0]) as {
        courseName?: string;
        provider?: string;
        completionDate?: string;
        expirationDate?: string;
        durationHours?: number;
        confidence: string;
      };
      return parsed;
    } catch (err) {
      this.logger.warn(`Extração AI falhou: ${err}`);
      return { confidence: 'low' };
    }
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
        ...(dto.durationHours !== undefined && { durationHours: dto.durationHours }),
      },
      include: { training: { select: { id: true, title: true, url: true, status: true } } },
    });
  }

  async getRenewalAlerts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado.');

    const monthsAdvance = user.preferences?.renewalPeriodMonths || 6;
    const now = new Date();
    
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

    const staleThresholdDate = new Date();
    staleThresholdDate.setMonth(now.getMonth() - 24);

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
        message: `A certificação em "${c.courseName || c.training.title}" expira dentro de ${monthsAdvance} meses!`,
      })),
      staleKnowledgeSuggestions: oldKnowledgeCerts.map(c => ({
        certificateId: c.id,
        courseName: c.courseName || c.training.title,
        completionDate: c.completionDate,
        monthsSinceCompletion: Math.floor((now.getTime() - c.completionDate!.getTime()) / (1000 * 3600 * 24 * 30)),
        message: `Já concluíste "${c.courseName || c.training.title}" há mais de 2 anos. Pode ser uma boa altura para reciclar estes conhecimentos.`,
      })),
    };
  }
}
