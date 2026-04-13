import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { CacheService } from '../../cache/cache.service';
import * as crypto from 'crypto';
import { Observable } from 'rxjs';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  userId?: string;
  language?: 'pt' | 'en';
  cacheTtl?: number;
  noCache?: boolean;
  noRetry?: boolean;
  systemPrompt?: string;
  responseFormat?: 'text' | 'json_object';
  history?: ChatMessage[];
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly groq: Groq;
  private readonly DEFAULT_MODEL = 'llama-3.3-70b-versatile';
  private readonly OCR_LANGS = 'eng+por';

  constructor(
    private readonly configService: ConfigService,
    public readonly cache: CacheService,
  ) {
    const apiKey = this.configService.get<string>('groq.apiKey');
    this.groq = new Groq({ apiKey });
  }

  onModuleInit() {
    const apiKey = this.configService.get<string>('groq.apiKey');
    if (!apiKey) {
      this.logger.error('CRITICAL: GROQ_API_KEY não está definida nas variáveis de ambiente!');
      this.logger.warn('As funcionalidades de AI (Chat, RAG, Recomendações) podem falhar.');
    } else {
      this.logger.log('Groq SDK inicializado com sucesso.');
    }
  }

  /**
   * Exponential backoff helper para Groq
   */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.error?.code;
        if ((status !== 429 && status !== 503) || i === maxRetries) throw error;

        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        this.logger.warn(`Groq API Error (${status}). Retrying in ${Math.round(delay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /**
   * Gera texto ou JSON usando Groq com suporte a histórico
   */
  async generateText(prompt: string, options: GenerateOptions = {}, model?: string): Promise<string> {
    const selectedModel = model || this.DEFAULT_MODEL;
    
    // Injeção dinâmica de idioma
    const langLabel = options.language === 'en' ? 'English' : 'Portuguese (Portugal)';
    let systemPrompt = options.systemPrompt || `Tu és o assistente de IA da Softinsa. Responde sempre em ${langLabel}.`;
    
    if (options.language) {
      systemPrompt += `\nCRITICAL: Respond STRICTLY in ${langLabel}.`;
    }

    if (options.responseFormat === 'json_object') {
      systemPrompt += `\nCRITICAL: Respond ONLY with a valid JSON object.`;
    }

    const userId = options.userId || 'anonymous';
    const historyHash = options.history ? crypto.createHash('md5').update(JSON.stringify(options.history)).digest('hex') : '';
    const hash = crypto.createHash('sha256').update(`${userId}:${systemPrompt}:${prompt}:${historyHash}`).digest('hex');
    const cacheKey = `groq:v3:${selectedModel}:${hash}`;

    if (!options.noCache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const startTime = Date.now();
      const result = await this.withRetry(async () => {
        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...(options.history || []),
          { role: 'user', content: prompt }
        ];

        const response = await this.groq.chat.completions.create({
          model: selectedModel,
          messages,
          temperature: options.temperature ?? (options.responseFormat === 'json_object' ? 0.1 : 0.7),
          top_p: options.topP ?? 0.9,
          max_tokens: options.maxTokens ?? 2048,
          response_format: options.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        });

        const latency = Date.now() - startTime;
        const usage = response.usage;
        if (usage) {
          this.logger.log({
            message: 'Groq AI Execution',
            model: selectedModel,
            tokens: usage.total_tokens,
            latency_ms: latency,
            userId: userId,
          });
        }

        return response.choices[0]?.message?.content || '';
      });

      if (!options.noCache) {
        await this.cache.set(cacheKey, result, options.cacheTtl || 3600);
      }
      return result;
    } catch (error: any) {
      this.logger.error(`Erro Groq: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gera um stream SSE (Server-Sent Events) compatível com NestJS
   */
  async generateStream(prompt: string, options: GenerateOptions = {}, model?: string): Promise<Observable<string>> {
    const selectedModel = model || this.DEFAULT_MODEL;
    const langLabel = options.language === 'en' ? 'English' : 'Portuguese (Portugal)';
    let systemPrompt = options.systemPrompt || `Tu és o assistente profissional da Softinsa. Responde em ${langLabel}.`;

    if (options.language) {
      systemPrompt += `\nCRITICAL: Respond STRICTLY in ${langLabel}.`;
    }

    return new Observable(observer => {
      this.withRetry(async () => {
        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...(options.history || []),
          { role: 'user', content: prompt }
        ];

        const stream = await this.groq.chat.completions.create({
          model: selectedModel,
          messages,
          temperature: options.temperature ?? 0.7,
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) observer.next(content);
        }
        observer.complete();
      }).catch(err => {
        this.logger.error(`Erro Stream: ${err.message}`);
        observer.error(err);
      });
    });
  }

  /**
   * Extrai texto de documentos em múltiplos formatos.
   * Fluxo: texto embutido (PDF/texto) -> OCR (imagem/PDF escaneado) -> fallback vazio.
   */
  async extractDocumentText(
    buffer: Buffer,
    options: { mimeType?: string; fileName?: string; maxChars?: number } = {},
  ): Promise<string> {
    const maxChars = options.maxChars || 40000;
    const fileKind = this.detectFileKind(options.mimeType, options.fileName);

    if (fileKind === 'text') {
      return buffer.toString('utf-8').substring(0, maxChars);
    }

    if (fileKind === 'image') {
      return this.extractImageText(buffer, maxChars);
    }

    if (fileKind === 'pdf') {
      const pdfText = await this.extractPdfText(buffer, maxChars);
      if (pdfText.trim().length > 0) return pdfText;

      this.logger.warn('PDF sem camada de texto. A tentar OCR por página...');
      return this.extractPdfTextWithOcr(buffer, maxChars);
    }

    // Fallback genérico: tenta PDF e depois OCR de imagem
    const asPdf = await this.extractPdfText(buffer, maxChars);
    if (asPdf.trim().length > 0) return asPdf;

    return this.extractImageText(buffer, maxChars);
  }

  /**
   * Utilitário para ler PDF com camada de texto (rápido e barato).
   */
  async extractPdfText(buffer: Buffer, maxChars = 40000): Promise<string> {
    let parser: any = null;

    try {
      const { PDFParse } = require('pdf-parse');
      parser = new PDFParse({ data: buffer });

      const data = await parser.getText();
      const text = (data?.text || '').substring(0, maxChars);

      if (!text.trim()) {
        this.logger.warn('PDF parse concluido, mas sem texto extraivel.');
      }

      return text;
    } catch (error: any) {
      this.logger.error(`PDF Read Error: ${error.message}`);
      return '';
    } finally {
      if (parser) {
        await parser.destroy().catch(() => undefined);
      }
    }
  }

  /**
   * OCR em imagem (PNG/JPG/etc.) via Tesseract.
   */
  async extractImageText(buffer: Buffer, maxChars = 40000): Promise<string> {
    let worker: any = null;

    try {
      const tesseract: any = await import('tesseract.js');
      const createWorker = tesseract.createWorker || tesseract.default?.createWorker;

      if (!createWorker) {
        this.logger.error('OCR Error: tesseract.js createWorker não disponível.');
        return '';
      }

      worker = await createWorker(this.OCR_LANGS);
      const result = await worker.recognize(buffer);
      const text = String(result?.data?.text || '')
        .replace(/\u0000/g, '')
        .trim();

      if (!text) {
        this.logger.warn('OCR de imagem não encontrou texto.');
      }

      return text.substring(0, maxChars);
    } catch (error: any) {
      this.logger.error(`OCR Image Error: ${error.message}`);
      return '';
    } finally {
      if (worker?.terminate) {
        await worker.terminate().catch(() => undefined);
      }
    }
  }

  /**
   * OCR para PDFs escaneados: renderiza páginas e corre OCR por página.
   */
  private async extractPdfTextWithOcr(buffer: Buffer, maxChars = 40000, maxPages = 3): Promise<string> {
    let parser: any = null;

    try {
      const { PDFParse } = require('pdf-parse');
      parser = new PDFParse({ data: buffer });

      const screenshots = await parser.getScreenshot({
        first: maxPages,
        imageDataUrl: false,
        imageBuffer: true,
      });

      const pages = Array.isArray(screenshots?.pages) ? screenshots.pages : [];
      if (pages.length === 0) {
        this.logger.warn('PDF OCR fallback: sem páginas renderizadas para OCR.');
        return '';
      }

      const collected: string[] = [];
      for (const page of pages) {
        if (!page?.data || !Buffer.isBuffer(page.data)) continue;

        const pageText = await this.extractImageText(
          page.data,
          Math.ceil(maxChars / Math.max(pages.length, 1)),
        );

        if (pageText) collected.push(pageText);

        const mergedSoFar = collected.join('\n');
        if (mergedSoFar.length >= maxChars) {
          return mergedSoFar.substring(0, maxChars);
        }
      }

      return collected.join('\n').substring(0, maxChars);
    } catch (error: any) {
      this.logger.error(`PDF OCR Error: ${error.message}`);
      return '';
    } finally {
      if (parser) {
        await parser.destroy().catch(() => undefined);
      }
    }
  }

  private detectFileKind(mimeType?: string, fileName?: string): 'pdf' | 'image' | 'text' | 'unknown' {
    const mime = (mimeType || '').toLowerCase();
    const name = (fileName || '').toLowerCase();

    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';

    if (
      mime.startsWith('image/') ||
      ['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.webp'].some((ext) => name.endsWith(ext))
    ) {
      return 'image';
    }

    if (mime.startsWith('text/') || name.endsWith('.txt')) return 'text';

    return 'unknown';
  }
}
