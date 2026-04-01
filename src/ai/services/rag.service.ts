import { Injectable, Logger } from '@nestjs/common';
import { AiService, GenerateOptions, ChatMessage } from './ai.service';
import { EmbeddingService, SearchResult } from './embedding.service';
import { ChunkSource } from '@prisma/client';
import { buildRagPrompt } from '../templates/rag.template';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationService } from './conversation.service';
import { CourseDbService } from '../../search/course-db.service';
import { Observable, map } from 'rxjs';

export interface RagQueryOptions {
  topK?: number;
  maxContextLength?: number;
  systemPrompt?: string;
  generateOptions?: GenerateOptions;
  sourceFilter?: ChunkSource[];
  conversationId?: string;
  model?: string;
}

export interface RagResponse {
  query: string;
  answer: string;
  conversationId: string;
  qualityScore: number;
  sources: any[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly SIMILARITY_THRESHOLD = 0.60; // Ligeiramente mais baixo para Hybrid

  constructor(
    private aiService: AiService,
    private embeddingService: EmbeddingService,
    private prisma: PrismaService,
    private conversationService: ConversationService,
    private courseDbService: CourseDbService,
  ) {}

  /**
   * Consulta RAG Enterprise com Busca Híbrida e Memória.
   */
  async query(question: string, options: RagQueryOptions = {}): Promise<RagResponse> {
    const userId = options.generateOptions?.userId;
    const lang = await this.getUserLanguage(userId);
    
    let conversationId = options.conversationId || 'anonymous';
    let history: ChatMessage[] = [];

    // 1. Gerir Sessão apenas se houver User autenticado
    if (userId) {
      const conversation = await this.conversationService.getOrCreateConversation(userId, options.conversationId);
      conversationId = conversation.id;
      history = await this.conversationService.getContextMessages(conversationId);
      await this.conversationService.addMessage(conversationId, 'user', question);
    }

    this.logger.log(`Hybrid RAG Query [${lang}] User: ${userId || 'Anon'}`);

    // 2. Busca Híbrida (Vetor + Keyword)
    const chunks = await this.hybridSearch(question, options);

    // 3. Score de Qualidade
    const qualityScore = chunks.length > 0 
      ? chunks.reduce((acc, c) => acc + (c.similarity || 0), 0) / chunks.length 
      : 0;

    // 4. Construir Contexto
    const { context, includedChunks } = await this.buildContext(chunks, userId, options.maxContextLength || 4000, lang);

    // 5. Gerar Resposta com Histórico (se existir)
    const userPrompt = buildRagPrompt(context, question, lang);

    const answer = await this.aiService.generateText(userPrompt, {
      ...options.generateOptions,
      language: lang as 'pt' | 'en',
      systemPrompt: options.systemPrompt,
      history, 
      temperature: 0.3,
    }, options.model);

    // 6. Persistir resposta se houver User
    if (userId) {
      await this.conversationService.addMessage(conversationId, 'assistant', answer);
    }

    return {
      query: question,
      answer,
      conversationId,
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
   * Stream RAG com suporte a memória.
   */
  async queryStream(question: string, options: RagQueryOptions = {}): Promise<Observable<string>> {
    const userId = options.generateOptions?.userId;
    const lang = await this.getUserLanguage(userId);
    
    let conversationId = options.conversationId || 'anonymous';
    let history: ChatMessage[] = [];

    if (userId) {
      const conversation = await this.conversationService.getOrCreateConversation(userId, options.conversationId);
      conversationId = conversation.id;
      history = await this.conversationService.getContextMessages(conversationId);
      await this.conversationService.addMessage(conversationId, 'user', question);
    }

    const chunks = await this.hybridSearch(question, options);
    const { context } = await this.buildContext(chunks, userId, options.maxContextLength || 4000, lang);
    const userPrompt = buildRagPrompt(context, question, lang);

    const stream = await this.aiService.generateStream(userPrompt, {
      ...options.generateOptions,
      language: lang as 'pt' | 'en',
      systemPrompt: options.systemPrompt,
      history,
    }, options.model);

    // Para streams com user, poderíamos acumular e guardar a resposta final, 
    // mas para simplificar mantemos o fluxo de streaming.
    return stream;
  }

  /**
   * Implementação de Busca Híbrida (Simplified RRF)
   */
  private async hybridSearch(query: string, options: RagQueryOptions): Promise<SearchResult[]> {
    if (!query) return [];
    const topK = options.topK || 8;
    
    // 1. Busca Semântica (Vector)
    const vectorChunks = await this.embeddingService.searchSimilar(query, topK, options.sourceFilter);
    
    // 2. Busca Keyword (SQL)
    const keywordCourses = await this.courseDbService.searchFromCache(query, topK);
    
    // 3. Converter Keyword Courses em "Virtual Chunks" para unificação
    const keywordChunks: SearchResult[] = keywordCourses.map(course => ({
      id: course.externalId,
      content: `CURSO: ${course.title}. DESC: ${course.description}`,
      similarity: 0.85, // Score artificial para keyword match
      source: ChunkSource.EXTERNAL_COURSE,
      metadata: { url: course.url },
      createdAt: new Date()
    }));

    // 4. Fusão e Deduplicação (Prioridade para vector, mas inclui keyword matches únicos)
    const seenIds = new Set(vectorChunks.map(c => c.id));
    const uniqueKeywordChunks = keywordChunks.filter(c => !seenIds.has(c.id));

    return [...vectorChunks, ...uniqueKeywordChunks]
      .filter(c => c.similarity >= this.SIMILARITY_THRESHOLD)
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, topK);
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
        include: { skills: true }
      });
      if (user) {
        const skills = user.skills?.map(s => `${s.skillName}(${s.level})`).join(', ');
        context += `${isEn ? 'USER PROFILE' : 'PERFIL'}: Role: ${user.userFunction}, Skills: ${skills}\n---\n`;
      }
    }

    for (const chunk of chunks) {
      const entry = `[REF:${chunk.id}] ${chunk.content}\n`;
      if ((context + entry).length > maxLength) break;
      context += entry;
      includedChunks.push(chunk);
    }

    return { context, includedChunks };
  }
}
