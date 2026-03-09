import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { OllamaQueueService } from '../cache/ollama-queue.service';

const OLLAMA_TIMEOUT_MS = 300_000; // 5 minutos

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';

  constructor(
    private readonly http: HttpService,
    private readonly queue: OllamaQueueService,
  ) {}

  /**
   * Warmup: pré-carrega o modelo para evitar cold start no primeiro pedido
   */
  async onModuleInit() {
    this.logger.log('Warmup do Ollama: a carregar modelos...');
    try {
      await Promise.all([
        this.warmupModel(process.env.LLM_MODEL || 'llama3'),
        this.warmupModel(process.env.EMBED_MODEL || 'nomic-embed-text'),
      ]);
      this.logger.log('Warmup concluído.');
    } catch {
      this.logger.warn('Warmup falhou (Ollama pode não estar disponível ainda).');
    }
  }

  private async warmupModel(model: string): Promise<void> {
    await firstValueFrom(
      this.http
        .post(`${this.baseUrl}/api/generate`, { model, prompt: '', stream: false })
        .pipe(timeout(OLLAMA_TIMEOUT_MS)),
    ).catch(() => null);
  }

  async generateText(prompt: string, model = process.env.LLM_MODEL || 'gemma2:2b'): Promise<string> {
    const cacheKey = `llm:${model}:${this.hash(prompt)}`;

    return this.queue.enqueue(cacheKey, async () => {
      const response = await firstValueFrom(
        this.http
          .post(`${this.baseUrl}/api/generate`, {
            model,
            prompt,
            stream: false,
            options: {
              temperature: 0.3,   // respostas mais focadas e consistentes
              num_predict: 400,   // limita output → resposta mais rápida
              top_p: 0.9,
            },
          })
          .pipe(timeout(OLLAMA_TIMEOUT_MS)),
      );
      return response.data.response as string;
    });
  }

  async chat(
    messages: { role: 'user' | 'assistant'; content: string }[],
    model = process.env.LLM_MODEL || 'gemma2:2b',
  ): Promise<string> {
    const cacheKey = `chat:${model}:${this.hash(JSON.stringify(messages))}`;

    return this.queue.enqueue(cacheKey, async () => {
      const response = await firstValueFrom(
        this.http
          .post(`${this.baseUrl}/api/chat`, { model, messages, stream: false })
          .pipe(timeout(OLLAMA_TIMEOUT_MS)),
      );
      return (response.data.message?.content || response.data) as string;
    });
  }

  async embed(
    text: string,
    model = process.env.EMBED_MODEL || 'nomic-embed-text',
  ): Promise<number[]> {
    const cacheKey = `embed:${model}:${this.hash(text)}`;

    return this.queue.enqueue(cacheKey, async () => {
      const response = await firstValueFrom(
        this.http
          .post(`${this.baseUrl}/api/embed`, { model, input: text })
          .pipe(timeout(OLLAMA_TIMEOUT_MS)),
      );
      return response.data.embeddings[0] as number[];
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
