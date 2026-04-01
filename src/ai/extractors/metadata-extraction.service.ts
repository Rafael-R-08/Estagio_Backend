import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../services/ai.service';
import { JsonSafeParser } from '../parsers/json-safe.parser';
import { CertificateMetadataSchema, CertificateMetadataOutput } from '../parsers/ai.schemas';
import { buildCertificateExtractionPrompt } from '../templates/certificate.template';

@Injectable()
export class MetadataExtractionService {
  private readonly logger = new Logger(MetadataExtractionService.name);

  constructor(private aiService: AiService) {}

  /**
   * Extração estruturada de metadados de certificados usando Groq + Zod.
   */
  async extractCertificateMetadata(
    buffer: Buffer, 
    trainingTitle: string, 
    originalName: string, 
    lang: string = 'pt'
  ): Promise<CertificateMetadataOutput> {
    this.logger.log(`Iniciando extração de metadados para: ${originalName}`);

    // 1. Extrair Texto do PDF
    const text = await this.aiService.extractPdfText(buffer);
    
    if (!text) {
      this.logger.warn('Nenhum texto extraído do PDF.');
      return this.getEmptyMetadata();
    }

    // 2. Construir Prompt Bilingue com Few-Shot (via Template)
    const prompt = buildCertificateExtractionPrompt(trainingTitle, originalName, text, lang);

    // 3. Chamar LLM com JSON Mode
    const rawResponse = await this.aiService.generateText(prompt, {
      responseFormat: 'json_object',
      temperature: 0.1, // Rigor máximo para extração
      language: lang as 'pt' | 'en',
    });

    // 4. Parsing Seguro com Zod
    const metadata = JsonSafeParser.parse(rawResponse, CertificateMetadataSchema);

    if (!metadata) {
      this.logger.error('Falha crítica na extração de metadados (Zod Validation Error).');
      return this.getEmptyMetadata();
    }

    this.logger.log(`Extração concluída com confiança: ${metadata.confidence}`);
    return metadata;
  }

  private getEmptyMetadata(): CertificateMetadataOutput {
    return {
      institution: null,
      courseName: null,
      durationHours: null,
      date: null,
      language: 'pt',
      skills: [],
      confidence: 'low',
    };
  }
}
