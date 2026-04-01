import { Injectable, Logger } from '@nestjs/common';
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
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly groq: Groq;
  private readonly DEFAULT_MODEL = 'llama-3.3-70b-versatile';

  constructor(
    private readonly configService: ConfigService,
    public readonly cache: CacheService,
  ) {
    const apiKey = this.configService.get('GROQ_API_KEY') || process.env.GROQ_API_KEY;
    this.groq = new Groq({ apiKey });
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
    const systemPrompt = options.systemPrompt || `Tu és o assistente profissional da Softinsa. Responde em ${langLabel}.`;

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
   * Utilitário para ler PDF (Isolado do processamento de metadados)
   */
  async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text.substring(0, 40000); 
    } catch (error: any) {
      this.logger.error(`PDF Read Error: ${error.message}`);
      return '';
    }
  }
}
