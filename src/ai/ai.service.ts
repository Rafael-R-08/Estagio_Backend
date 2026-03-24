import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
  ) {
    const githubConfig = this.configService.get('githubModels');
    this.client = new OpenAI({
      apiKey: githubConfig.token,
      baseURL: githubConfig.endpoint,
    });
  }

  async generateText(prompt: string, model?: string): Promise<string> {
    const defaultModel = this.configService.get('githubModels.model');
    const selectedModel = model || defaultModel;
    const cacheKey = `llm:${selectedModel}:${this.hash(prompt)}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const response = await this.client.chat.completions.create({
        model: selectedModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 400,
        top_p: 0.9,
      });
      return response.choices[0].message.content || '';
    });
  }

  async chat(
    messages: { role: 'user' | 'assistant'; content: string }[],
    model?: string,
  ): Promise<string> {
    const defaultModel = this.configService.get('githubModels.model');
    const selectedModel = model || defaultModel;
    const cacheKey = `chat:${selectedModel}:${this.hash(JSON.stringify(messages))}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const response = await this.client.chat.completions.create({
        model: selectedModel,
        messages: messages as any,
      });
      return response.choices[0].message.content || '';
    });
  }

  async embed(
    text: string,
    model?: string,
  ): Promise<number[]> {
    const defaultModel = this.configService.get('githubModels.embedModel');
    const selectedModel = model || defaultModel;
    const cacheKey = `embed:${selectedModel}:${this.hash(text)}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const response = await this.client.embeddings.create({
        model: selectedModel,
        input: text,
      });
      return response.data[0].embedding;
    });
  }

  /** Hash simples para gerar cache keys */
  private hash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }
}
