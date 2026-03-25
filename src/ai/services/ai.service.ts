// src/ai/services/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CacheService } from '../../cache/cache.service.js';
import * as crypto from 'crypto';

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  userId?: string;
  cacheTtl?: number;
  noCache?: boolean;
  noRetry?: boolean;
  systemPrompt?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    public readonly cache: CacheService,
  ) {
    const githubConfig = this.configService.get('githubModels');
    this.client = new OpenAI({
      apiKey: githubConfig?.token || process.env.GITHUB_TOKEN,
      baseURL: githubConfig?.endpoint || 'https://models.inference.ai.azure.com',
    });
  }

  /**
   * Exponential backoff helper
   */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Se não for 429 ou se esgotamos as tentativas, lança o erro
        if (error.status !== 429 || i === maxRetries) {
          throw error;
        }

        // Se for 429, espera e tenta novamente
        const retryAfter = error.headers?.['retry-after'];
        const delay = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : Math.pow(2, i) * 1000; // 1s, 2s, 4s

        this.logger.warn(`Rate limit (429) detectado. Retry ${i + 1}/${maxRetries} em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Gera texto usando LLM com opções dinâmicas e cache seguro (SHA-256 + userId)
   */
  async generateText(prompt: string, options: GenerateOptions = {}, model?: string): Promise<string> {
    const defaultModel = this.configService.get('githubModels.model') || 'gpt-4o';
    const selectedModel = model || defaultModel;
    const effectiveSystemPrompt = options.systemPrompt || "És um assistente especializado na Softinsa. Responde sempre em português de Portugal.";
    
    // Cache key segura: SHA-256 de (userId + systemPrompt + prompt)
    const userId = options.userId || 'anonymous';
    const hash = crypto.createHash('sha256')
      .update(`${userId}:${effectiveSystemPrompt}:${prompt}`)
      .digest('hex');
    const cacheKey = `ai:${selectedModel}:${hash}`;

    if (!options.noCache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return cached;
      }
    }

    const result = await this.withRetry(() => this.callApi(selectedModel, effectiveSystemPrompt, prompt, options));
    
    if (!options.noCache) {
      await this.cache.set(cacheKey, result, options.cacheTtl || 3600);
    }
    
    return result;
  }

  private async callApi(model: string, systemPrompt: string, userPrompt: string, options: GenerateOptions): Promise<string> {
    const maxTokens = options.maxTokens || 800;
    const temperature = options.temperature ?? 0.3;

    try {
      const response = await this.client.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: temperature,
        max_tokens: maxTokens,
      });

      const content = response.choices[0].message.content || '';
      if (response.choices[0].finish_reason === 'length') {
        this.logger.warn(`Resposta truncada (${maxTokens} tokens). Modelo: ${model}`);
      }

      return content;
    } catch (error: any) {
      this.logger.error(`Erro na API GitHub Models: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gera embedding com cache de 24h (SHA-256) e retry p/ 429
   */
  async embed(text: string, model?: string): Promise<number[]> {
    const defaultModel = this.configService.get('githubModels.embedModel') || 'text-embedding-3-small';
    const selectedModel = model || defaultModel;
    
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const cacheKey = `embed:${selectedModel}:${hash}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    return await this.withRetry(async () => {
      try {
        const response = await this.client.embeddings.create({
          model: selectedModel,
          input: text,
        });
        const embedding = response.data[0].embedding;
        await this.cache.set(cacheKey, JSON.stringify(embedding), 86400); // 24h
        return embedding;
      } catch (error: any) {
        this.logger.error(`Erro no embedding: ${error.message}`);
        throw error;
      }
    });
  }
}
