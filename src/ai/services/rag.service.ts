import { Injectable, Logger } from '@nestjs/common';
import { AiService, GenerateOptions } from './ai.service';
import { EmbeddingService, SearchResult } from './embedding.service';
import { ChunkSource } from '@prisma/client';
import { buildRagPrompt } from '../templates/rag.template';
import { PrismaService } from '../../prisma/prisma.service';
import { Observable } from 'rxjs';

export interface RagQueryOptions {
  topK?: number;
  maxContextLength?: number;
  systemPrompt?: string;
  generateOptions?: GenerateOptions;
  sourceFilter?: ChunkSource[];
  model?: string;
}

export interface RagResponse {
  query: string;
  answer: string;
  qualityScore: number; // Avg similarity of chunks
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
  private readonly SIMILARITY_THRESHOLD = 0.65;

  constructor(
    private aiService: AiService,
    private embeddingService: EmbeddingService,
    private prisma: PrismaService,
  ) {}

  /**
   * Executa uma consulta RAG completa (Busca + Contexto + Geração)
   */
  async query(question: string, options: RagQueryOptions = {}): Promise<RagResponse> {
    const topK = options.topK || 5;
    const maxContextLength = options.maxContextLength || 3500;
    const userId = options.generateOptions?.userId;

    const language = await this.getUserLanguage(userId);
    
    this.logger.log(`RAG query [${language}]: "${question}" (topK=${topK})`);

    // 1. Busca Semântica
    const allChunks = await this.embeddingService.searchSimilar(
      question, 
      topK, 
      options.sourceFilter
    );

    // 2. Filtro de Relevância (similarity > 0.65)
    const chunks = allChunks.filter(c => c.similarity >= this.SIMILARITY_THRESHOLD);
    
    // 3. RAG Quality Score (Métrica de Produção)
    const qualityScore = chunks.length > 0 
      ? chunks.reduce((acc, c) => acc + c.similarity, 0) / chunks.length 
      : 0;

    // 4. Construir Contexto (Chunks + Perfil)
    const { context, includedChunks } = await this.buildContext(chunks, userId, maxContextLength, language);

    // 5. Gerar Resposta com Llama 3.3
    const userPrompt = buildRagPrompt(context, question, language);
    
    const answer = await this.aiService.generateText(userPrompt, {
      ...options.generateOptions,
      language: language as 'pt' | 'en',
      systemPrompt: options.systemPrompt,
      maxTokens: options.generateOptions?.maxTokens || 1500,
      temperature: options.generateOptions?.temperature || 0.1,
    }, options.model);

    return {
      query: question,
      answer,
      qualityScore,
      sources: includedChunks.map(c => ({
        id: c.id,
        content: c.content,
        similarity: c.similarity,
        source: c.source
      }))
    };
  }

  /**
   * Versão Stream da consulta RAG (para Chat SSE)
   */
  async queryStream(question: string, options: RagQueryOptions = {}): Promise<Observable<string>> {
    const topK = options.topK || 5;
    const maxContextLength = options.maxContextLength || 3500;
    const userId = options.generateOptions?.userId;

    const language = await this.getUserLanguage(userId);
    
    const allChunks = await this.embeddingService.searchSimilar(question, topK, options.sourceFilter);
    const chunks = allChunks.filter(c => c.similarity >= this.SIMILARITY_THRESHOLD);
    
    const { context } = await this.buildContext(chunks, userId, maxContextLength, language);
    const userPrompt = buildRagPrompt(context, question, language);

    return this.aiService.generateStream(userPrompt, {
      ...options.generateOptions,
      language: language as 'pt' | 'en',
      systemPrompt: options.systemPrompt,
      temperature: options.generateOptions?.temperature || 0.6,
    }, options.model);
  }

  private async getUserLanguage(userId?: string): Promise<string> {
    if (!userId) return 'pt';
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    return settings?.uiLanguage || 'pt';
  }

  private async buildContext(chunks: SearchResult[], userId: string | undefined, maxLength: number, lang: string) {
    let context = '';
    const includedChunks: SearchResult[] = [];
    const isEn = lang === 'en';

    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { 
          certificates: true,
          trainings: { take: 5, orderBy: { createdAt: 'desc' } },
          skills: true
        }
      });

      if (user) {
        const certs = user.certificates.map(c => `- ${c.provider}: ${c.courseName}`).join(', ');
        const skills = user.skills?.map(s => `${s.skillName}(${s.level})`).join(', ');
        
        context += `${isEn ? 'USER PROFILE' : 'PERFIL'}: Position: ${user.userFunction}, Skills: ${skills}, Interests: ${user.interests?.join(',')}, Certs: ${certs}\n---\n`;
      }
    }

    // Injeção de Chunks compactada
    for (const chunk of chunks) {
      const entry = `[S:${chunk.source}] ${chunk.content}\n`;
      if ((context + entry).length > maxLength) break;
      context += entry;
      includedChunks.push(chunk);
    }

    return { context, includedChunks };
  }

  async getWelcomeMessage(userId?: string): Promise<string> {
    const lang = await this.getUserLanguage(userId);
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      return lang === 'en' 
        ? `Hi, ${user?.name || 'User'}! 👋 I'm your Career Assistant. How can I help?`
        : `Olá, ${user?.name || 'User'}! 👋 Sou o teu Assistente de Carreira. Como posso ajudar?`;
    }
    return lang === 'en' ? "Hi! 👋 How can I help with your career?" : "Olá! 👋 Como posso ajudar na tua carreira?";
  }
}
