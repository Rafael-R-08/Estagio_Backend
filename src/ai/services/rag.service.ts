import { Injectable, Logger } from '@nestjs/common';
import { AiService, GenerateOptions } from './ai.service.js';
import { EmbeddingService, SearchResult } from './embedding.service.js';
import { ChunkSource } from '@prisma/client';
import { buildRagPrompt } from '../templates/rag.template.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface RagQueryOptions {
  topK?: number;
  maxContextLength?: number;
  systemPrompt?: string;
  generateOptions?: GenerateOptions;
  sourceFilter?: ChunkSource[];
}

export interface RagResponse {
  query: string;
  answer: string;
  sources: Array<{
    id: string;
    content: string;
    similarity: number;
    source: string;
  }>;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private aiService: AiService,
    private embeddingService: EmbeddingService,
    private prisma: PrismaService,
  ) {}

  /**
   * Pipeline RAG: Pesquisa -> Contexto -> Geração
   */
  async query(question: string, options: RagQueryOptions = {}): Promise<RagResponse> {
    const topK = options.topK || 5;
    const maxContextLength = options.maxContextLength || 3000;
    
    this.logger.log(`RAG query: "${question}" (topK=${topK}, sources=${options.sourceFilter?.join(',') || 'ALL'})`);

    // 1. Pesquisa semântica
    const chunks = await this.embeddingService.searchSimilar(
      question, 
      topK, 
      options.sourceFilter
    );

    if (chunks.length === 0) {
      this.logger.warn(`Zero chunks encontrados para a query: ${question}`);
      const answer = await this.aiService.generateText(question, { 
        ...options.generateOptions,
        userId: options.generateOptions?.userId 
      });
      return { query: question, answer, sources: [] };
    }

    // 2. Construção de contexto
    let context = '';
    const includedChunks: SearchResult[] = [];
    
    // 2.1 Contexto do Utilizador (se houver userId)
    const userId = options.generateOptions?.userId;
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { 
          preferences: true,
          certificates: true,
          trainings: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      });
      if (user) {
        const certs = user.certificates.map(c => `- ${c.courseName || 'Certificado'} (${c.provider || 'N/A'})`).join('\n') || 'Nenhuma';
        const recentTrainings = user.trainings.map(t => `- ${t.title} (${t.status})`).join('\n') || 'Nenhum';
        
        context += `PERFIL E HISTÓRICO DO UTILIZADOR:
- Nome: ${user.name || 'N/A'}
- Service Line: ${user.serviceLine || 'N/A'}
- Tech Stack: ${user.techStack?.join(', ') || 'N/A'}
- Interesses: ${user.interests?.join(', ') || 'N/A'}
- Objetivos: ${user.preferences?.learningGoals?.join(', ') || 'N/A'}

CERTIFICAÇÕES ATUAIS:
${certs}

FORMAÇÕES RECENTES:
${recentTrainings}
---
`;
      }
    }

    for (const chunk of chunks) {
      const entry = `[Fonte: ${chunk.source}] ${chunk.content}\n\n`;
      if ((context + entry).length > maxContextLength) break;
      context += entry;
      includedChunks.push(chunk);
    }

    // 3. Montar Prompt
    const userPrompt = buildRagPrompt(context, question);
    const systemPromptOption: Record<string, any> = {};
    if (options.systemPrompt) {
      systemPromptOption.systemPrompt = options.systemPrompt;
    }

    // 4. Gerar resposta
    const answer = await this.aiService.generateText(userPrompt, {
      ...options.generateOptions,
      ...systemPromptOption,
      maxTokens: options.generateOptions?.maxTokens || 1000,
    });

    return {
      query: question,
      answer,
      sources: includedChunks.map(c => ({
        id: c.id,
        content: c.content,
        similarity: c.similarity,
        source: c.source
      }))
    };
  }
  /**
   * Gera uma mensagem de boas-vindas personalizada
   */
  async getWelcomeMessage(userId?: string): Promise<string> {
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      return `Olá, ${user?.name || 'User'}! 👋 Sou o teu assistente de carreira na Softinsa. Estou aqui para te ajudar a encontrar as melhores formações, esclarecer dúvidas sobre certificações e planear o teu progresso. Em que posso ser útil hoje?`;
    }
    return `Olá! 👋 Sou o Assistente de Carreira da Softinsa. Posso ajudar-te a explorar o catálogo de cursos, sugerir certificações e responder a dúvidas sobre o teu desenvolvimento profissional. Como posso ajudar?`;
  }
}
