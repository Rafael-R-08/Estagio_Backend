import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { CacheService } from '../../cache/cache.service';
import * as crypto from 'crypto';
import * as pdf from 'pdf-parse';
import { Observable } from 'rxjs';

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
   * Exponential backoff helper adaptado para Groq (429/503)
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
   * Gera texto usando Llama 3.3 via Groq
   */
  async generateText(prompt: string, options: GenerateOptions = {}, model?: string): Promise<string> {
    const selectedModel = model || this.DEFAULT_MODEL;
    
    // Injeção dinâmica de idioma
    const langLabel = options.language === 'en' ? 'English' : 'Portuguese (Portugal)';
    let systemPrompt = options.systemPrompt || `Tu és o assistente de IA da Softinsa. Responde sempre em ${langLabel}.`;
    
    if (options.language) {
      systemPrompt += `\nCRITICAL: Respond STRICTLY in ${langLabel}.`;
    }

    const userId = options.userId || 'anonymous';
    const hash = crypto.createHash('sha256').update(`${userId}:${systemPrompt}:${prompt}`).digest('hex');
    const cacheKey = `groq:v2:${selectedModel}:${hash}`; // v2 para invalidar cache antigo

    if (!options.noCache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const startTime = Date.now();
      const result = await this.withRetry(async () => {
        let userPrompt = prompt;
        if (options.responseFormat === 'json_object' && !prompt.toLowerCase().includes('json')) {
          userPrompt += ' (Respond ONLY in JSON format)';
        }

        const response = await this.groq.chat.completions.create({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: options.temperature ?? 0.1,
          top_p: options.topP ?? 0.9,
          max_tokens: options.maxTokens ?? 1024,
          response_format: options.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        });

        const latency = Date.now() - startTime;
        const usage = response.usage;
        if (usage) {
          const logPayload = {
            message: 'Groq AI Execution',
            model: selectedModel,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            latency_ms: latency,
            userId: userId,
            lang: options.language,
            type: options.responseFormat === 'json_object' ? 'structured' : 'text'
          };
          this.logger.log(logPayload);
        }

        return response.choices[0]?.message?.content || '';
      });

      if (!options.noCache) {
        await this.cache.set(cacheKey, result, options.cacheTtl || 3600);
      }
      return result;
    } catch (error: any) {
      this.logger.error(`Erro na API Groq: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gera um stream de texto usando Groq para melhor UX (SSE)
   */
  generateStream(prompt: string, options: GenerateOptions = {}, model?: string): Observable<string> {
    const selectedModel = model || this.DEFAULT_MODEL;
    
    // Injeção dinâmica de idioma
    const langLabel = options.language === 'en' ? 'English' : 'Portuguese (Portugal)';
    let systemPrompt = options.systemPrompt || `Tu és o assistente de IA da Softinsa. Responde sempre em ${langLabel}.`;
    
    if (options.language) {
      systemPrompt += `\nCRITICAL: Respond STRICTLY in ${langLabel}.`;
    }

    return new Observable(observer => {
      this.withRetry(async () => {
        const stream = await this.groq.chat.completions.create({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: options.temperature ?? 0.6, // Valor sugerido para o Chat
          top_p: options.topP ?? 0.9,
          max_tokens: options.maxTokens ?? 1024,
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            observer.next(content);
          }
        }
        
        observer.complete();
      }).catch(err => {
        this.logger.error(`Erro no stream Groq: ${err.message}`);
        observer.error(err);
      });
    });
  }

  /**
   * Extração de texto genérica (legado adaptado para Llama 3.3)
   */
  async analyzeDocument(buffer: Buffer, prompt: string, options: GenerateOptions = {}): Promise<string> {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      const text = data.text.substring(0, 30000); 
      
      const enrichedPrompt = `DOCUMENT CONTENT:\n${text}\n\nINSTRUCTION: ${prompt}`;
      return this.generateText(enrichedPrompt, { ...options, temperature: 0.1 });
    } catch (error: any) {
      this.logger.error(`Falha na extração de texto do PDF: ${error.message}`);
      throw error;
    }
  }
}
