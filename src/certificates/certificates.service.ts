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

    const extracted = await this.extractMetadataWithAI(
      training?.title || cert.courseName || '',
      basename(cert.fileUrl),
      {},
    );

    return this.prisma.certificate.update({
      where: { id },
      data: { extractedMetadata: extracted as object },
    });
  }

  // ---- Extração de metadados com Ollama ----
  private async extractMetadataWithAI(
    courseTitle: string,
    filename: string,
    hints: Partial<CreateCertificateDto>,
  ): Promise<{
    courseName?: string;
    provider?: string;
    completionDate?: string;
    expirationDate?: string;
    durationHours?: number;
    confidence: string;
  }> {
    try {
      const prompt = `Analisa as seguintes informações sobre um certificado de formação e extrai os metadados em JSON.

Título do curso: "${courseTitle}"
Nome do ficheiro: "${filename}"
${hints.courseName ? `Nome fornecido: "${hints.courseName}"` : ''}
${hints.provider ? `Fornecedor: "${hints.provider}"` : ''}

Responde APENAS com um JSON válido com estes campos (usa null se não conseguires determinar):
{
  "courseName": "nome completo do curso",
  "provider": "empresa/plataforma que emitiu (ex: Microsoft, Salesforce, IBM, Udemy)",
  "completionDate": "data ISO 8601 ou null",
  "expirationDate": "data ISO 8601 ou null (tipicamente 2-3 anos após conclusão para certs cloud)",
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
}
