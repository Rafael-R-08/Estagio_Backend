import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../services/ai.service';
import { JsonSafeParser } from '../parsers/json-safe.parser';
import {
  CertificateMetadataSchema,
  CertificateMetadataOutput,
  CertificateMetadataRawSchema,
  CertificateMetadataRawOutput,
} from '../parsers/ai.schemas';
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
    lang: string = 'pt',
    mimeType?: string,
  ): Promise<CertificateMetadataOutput> {
    this.logger.log(`Iniciando extração de metadados para: ${originalName}`);

    // 1. Extrair Texto do PDF
    const text = await this.aiService.extractDocumentText(buffer, {
      mimeType,
      fileName: originalName,
      maxChars: 60000,
    });
    
    if (!text) {
      this.logger.warn('Nenhum texto extraído do PDF.');
      return this.getEmptyMetadata(lang, {
        evidence: {
          reason: 'no_text_extracted',
          mimeType: mimeType || null,
          sourceFile: originalName || null,
          trainingTitleHint: trainingTitle || null,
        },
      });
    }

    // 2. Construir Prompt Bilingue com Few-Shot (via Template)
    const prompt = buildCertificateExtractionPrompt(trainingTitle, originalName, text, lang);

    // 3. Chamar LLM com JSON Mode
    const rawResponse = await this.aiService.generateText(prompt, {
      responseFormat: 'json_object',
      temperature: 0.1, // Rigor máximo para extração
      language: lang as 'pt' | 'en',
      noCache: true, // Certificados são documentos únicos — não cachear
    });

    // 4. Parsing flexível para suportar formatos heterogéneos
    const rawMetadata = JsonSafeParser.parse(rawResponse, CertificateMetadataRawSchema);

    if (!rawMetadata) {
      this.logger.error('Falha crítica na extração de metadados (raw parse error).');
      return this.getEmptyMetadata(lang, {
        evidence: {
          reason: 'raw_json_parse_failed',
          sourceFile: originalName || null,
          trainingTitleHint: trainingTitle || null,
        },
      });
    }

    // 5. Normalização para estrutura canónica
    const normalizedMetadata = this.normalizeMetadata(rawMetadata, text, trainingTitle, originalName, lang);

    // 6. Validação final
    const validation = CertificateMetadataSchema.safeParse(normalizedMetadata);
    if (!validation.success) {
      this.logger.warn(`Falha na validação final dos metadados: ${validation.error.message}`);
      return this.getEmptyMetadata(lang, {
        evidence: {
          reason: 'normalized_validation_failed',
          sourceFile: originalName || null,
          trainingTitleHint: trainingTitle || null,
        },
      });
    }

    const metadata = validation.data;

    this.logger.log(`Extração concluída com confiança: ${metadata.confidence}`);
    return metadata;
  }

  private normalizeMetadata(
    raw: CertificateMetadataRawOutput,
    extractedText: string,
    trainingTitle: string,
    originalName: string,
    langHint: string,
  ): CertificateMetadataOutput {
    const rawInstitution = this.pickString(raw.institution, raw.issuer, raw.provider, raw.organization);
    const institution = rawInstitution || this.detectInstitutionFromText(extractedText);

    const courseName = this.pickString(raw.courseName, raw.course, raw.certificationName, raw.title)
      || (trainingTitle || null);

    const rawDate = this.pickString(raw.date, raw.completionDate, raw.issueDate, raw.issuedDate);
    const rawExpiration = this.pickString(raw.expirationDate, raw.validUntil);

    const durationHours = this.parseDurationHours(raw.durationHours ?? raw.duration ?? raw.durationText);
    const skills = this.parseSkills(raw.skills);

    const participantName = this.pickString(raw.participantName, raw.recipientName);
    const credentialId = this.pickString(raw.credentialId, raw.certificateId);
    const credentialUrl = this.pickString(raw.credentialUrl, raw.verificationUrl, raw.verifyUrl);
    const score = this.pickString(raw.score);
    const grade = this.pickString(raw.grade);

    const date = this.normalizeDate(rawDate);
    const expirationDate = this.normalizeDate(rawExpiration);

    const language = this.normalizeLanguage(raw.language, extractedText, langHint);
    const confidence = this.normalizeConfidence(raw.confidence, {
      institution,
      courseName,
      date,
      skills,
      durationHours,
    });

    return {
      institution,
      courseName,
      durationHours,
      date,
      expirationDate,
      participantName,
      credentialId,
      credentialUrl,
      score,
      grade,
      language,
      skills,
      confidence,
      evidence: {
        sourceFile: originalName || null,
        trainingTitleHint: trainingTitle || null,
        rawDateText: rawDate || null,
        rawDurationText: this.pickString(raw.duration, raw.durationText) || null,
      },
    };
  }

  private pickString(...values: unknown[]): string | null {
    for (const value of values) {
      const normalized = this.normalizeUnknownToString(value);
      if (normalized) return normalized;
    }
    return null;
  }

  private normalizeUnknownToString(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const str = this.normalizeUnknownToString(item);
        if (str) return str;
      }
      return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'n/a') {
      return null;
    }

    return trimmed;
  }

  private parseSkills(value: unknown): string[] {
    if (!value) return [];

    const rawSkills = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[,;\n|]/g)
        : [];

    const normalized = rawSkills
      .map((skill) => (typeof skill === 'string' ? skill.trim() : String(skill || '').trim()))
      .filter((skill) => skill.length >= 2 && skill.length <= 80)
      .slice(0, 20);

    return [...new Set(normalized)];
  }

  private parseDurationHours(value: unknown): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return parseFloat(value.toFixed(2));
    }

    const text = this.normalizeUnknownToString(value);
    if (!text) return null;

    const isoMatch = text.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
    if (isoMatch) {
      const hours = Number(isoMatch[1] || 0);
      const minutes = Number(isoMatch[2] || 0);
      const duration = parseFloat((hours + minutes / 60).toFixed(2));
      return duration > 0 ? duration : null;
    }

    const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hour|hours|hora|horas)\b/i);
    if (hourMatch) {
      const hours = Number(hourMatch[1].replace(',', '.'));
      if (!Number.isFinite(hours)) return null;
      return hours > 0 ? parseFloat(hours.toFixed(2)) : null;
    }

    const minuteMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m|min|mins|minute|minutes|minuto|minutos)\b/i);
    if (minuteMatch) {
      const minutes = Number(minuteMatch[1].replace(',', '.'));
      if (!Number.isFinite(minutes)) return null;
      const duration = parseFloat((minutes / 60).toFixed(2));
      return duration > 0 ? duration : null;
    }

    const numeric = Number(text.replace(',', '.'));
    if (Number.isFinite(numeric) && numeric > 0) {
      return parseFloat(numeric.toFixed(2));
    }

    return null;
  }

  private normalizeDate(value: unknown): string | null {
    const raw = this.normalizeUnknownToString(value);
    if (!raw) return null;

    const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const dmyMatch = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }

    return null;
  }

  private normalizeLanguage(languageValue: unknown, extractedText: string, langHint: string): 'pt' | 'en' {
    const explicit = this.normalizeUnknownToString(languageValue)?.toLowerCase();

    if (explicit) {
      if (explicit.includes('en') || explicit.includes('english') || explicit.includes('ingl')) return 'en';
      if (explicit.includes('pt') || explicit.includes('portugu')) return 'pt';
    }

    const hint = (langHint || '').toLowerCase();
    if (hint.startsWith('en')) return 'en';
    if (hint.startsWith('pt')) return 'pt';

    const text = (extractedText || '').toLowerCase();
    const englishSignals = ['certificate', 'issued', 'successfully completed', 'verify'];
    const ptSignals = ['certificado', 'emitido', 'concluiu', 'verificar'];
    const enScore = englishSignals.filter((s) => text.includes(s)).length;
    const ptScore = ptSignals.filter((s) => text.includes(s)).length;

    return enScore > ptScore ? 'en' : 'pt';
  }

  private normalizeConfidence(
    confidenceValue: unknown,
    context: {
      institution: string | null;
      courseName: string | null;
      date: string | null;
      skills: string[];
      durationHours: number | null;
    },
  ): 'high' | 'medium' | 'low' {
    const explicit = this.normalizeUnknownToString(confidenceValue)?.toLowerCase();
    if (explicit === 'high' || explicit === 'medium' || explicit === 'low') {
      return explicit;
    }

    let score = 0;
    if (context.institution) score += 1;
    if (context.courseName) score += 1;
    if (context.date) score += 1;
    if (context.skills.length > 0) score += 1;
    if (context.durationHours !== null) score += 1;

    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private detectInstitutionFromText(text: string): string | null {
    const lower = (text || '').toLowerCase();

    const providers: Array<{ keyword: string; name: string }> = [
      { keyword: 'microsoft', name: 'Microsoft' },
      { keyword: 'udemy', name: 'Udemy' },
      { keyword: 'linkedin learning', name: 'LinkedIn Learning' },
      { keyword: 'ibm', name: 'IBM' },
      { keyword: 'coursera', name: 'Coursera' },
      { keyword: 'edx', name: 'edX' },
      { keyword: 'google cloud', name: 'Google Cloud' },
      { keyword: 'aws training', name: 'AWS' },
      { keyword: 'salesforce', name: 'Salesforce' },
      { keyword: 'softinsa', name: 'Softinsa' },
    ];

    const match = providers.find((provider) => lower.includes(provider.keyword));
    return match ? match.name : null;
  }

  private getEmptyMetadata(
    language: string = 'pt',
    overrides?: Partial<CertificateMetadataOutput>,
  ): CertificateMetadataOutput {
    return {
      institution: null,
      courseName: null,
      durationHours: null,
      date: null,
      expirationDate: null,
      participantName: null,
      credentialId: null,
      credentialUrl: null,
      score: null,
      grade: null,
      language: language === 'en' ? 'en' : 'pt',
      skills: [],
      confidence: 'low',
      evidence: {},
      ...overrides,
    };
  }
}
