import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { EmbeddingService, SearchResult } from '../ai/embedding.service';
import {
  buildRagPrompt,
  buildRecommendationPrompt,
} from './prompt-templates/default.template';

export interface RagResponse {
  query: string;
  answer: string;
  sources: Array<{
    id: string;
    content: string;
    similarity: number;
  }>;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private aiService: AiService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Pipeline RAG completo:
   * 1. Gera embedding da query
   * 2. Pesquisa chunks mais similares no pgvector
   * 3. Constrói prompt com contexto
   * 4. Envia ao LLM e devolve resposta
   */
  async query(userQuery: string, topK: number = 5): Promise<RagResponse> {
    this.logger.log(`RAG query: "${userQuery}" (topK=${topK})`);

    // 1. Pesquisar chunks mais relevantes
    const relevantChunks: SearchResult[] =
      await this.embeddingService.searchChunks(userQuery, topK);

    if (relevantChunks.length === 0) {
      this.logger.warn('Nenhum chunk relevante encontrado para a query');
      return {
        query: userQuery,
        answer:
          'Não encontrei informação suficiente para responder a esta questão.',
        sources: [],
      };
    }

    // 2. Construir contexto a partir dos chunks
    const context = relevantChunks
      .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
      .join('\n\n');

    // 3. Construir prompt com template
    const prompt = buildRagPrompt(context, userQuery);

    // 4. Enviar ao LLM
    this.logger.log(
      `Enviando prompt ao LLM com ${relevantChunks.length} chunks de contexto`,
    );
    const answer = await this.aiService.generateText(prompt);

    return {
      query: userQuery,
      answer: answer.trim(),
      sources: relevantChunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        similarity: chunk.similarity,
      })),
    };
  }

  /**
   * Pipeline RAG para recomendações personalizadas
   */
  async recommend(
    userQuery: string,
    userProfile: {
      techStack?: string[];
      interests?: string[];
      experienceLevel?: string;
    } = {},
    topK: number = 5,
  ): Promise<RagResponse> {
    this.logger.log(`RAG recommend: "${userQuery}"`);

    // 1. Pesquisar chunks relevantes
    const relevantChunks: SearchResult[] =
      await this.embeddingService.searchChunks(userQuery, topK);

    const context =
      relevantChunks.length > 0
        ? relevantChunks
            .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
            .join('\n\n')
        : 'Não há cursos indexados ainda.';

    // 2. Construir prompt de recomendação
    const prompt = buildRecommendationPrompt(
      {
        techStack: userProfile.techStack ?? [],
        interests: userProfile.interests ?? [],
        experienceLevel: userProfile.experienceLevel ?? '',
      },
      context,
      userQuery,
    );

    // 3. Enviar ao LLM
    const answer = await this.aiService.generateText(prompt);

    return {
      query: userQuery,
      answer: answer.trim(),
      sources: relevantChunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        similarity: chunk.similarity,
      })),
    };
  }
}
