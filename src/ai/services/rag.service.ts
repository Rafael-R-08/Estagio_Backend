import { Injectable, Logger } from '@nestjs/common';
import { AiService, GenerateOptions, ChatMessage } from './ai.service';
import { EmbeddingService, SearchResult } from './embedding.service';
import { ChunkSource, TrainingStatus } from '@prisma/client';
import { buildRagPrompt } from '../templates/rag.template';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationService } from './conversation.service';
import { CourseDbService } from '../../search/course-db.service';
import { Observable } from 'rxjs';

export interface RagQueryOptions {
  topK?: number;
  maxContextLength?: number;
  systemPrompt?: string;
  generateOptions?: GenerateOptions;
  sourceFilter?: ChunkSource[];
  conversationId?: string;
  model?: string;
  mentionedTrainingIds?: string[];
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
      const conversation = await this.conversationService.getOrCreateConversation(userId, options.conversationId, question);
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

    // 4. Contexto de cursos mencionados explicitamente (@ mentions)
    let mentionedContext = '';
    let mentionedTitles: string[] = [];
    if (options.mentionedTrainingIds?.length && userId) {
      const result = await this.buildMentionedCoursesContext(options.mentionedTrainingIds, userId, lang);
      mentionedContext = result.context;
      mentionedTitles = result.titles;
    }

    // 5. Construir Contexto
    const { context, includedChunks } = await this.buildContext(chunks, userId, options.maxContextLength || 4000, lang, mentionedContext);

    // 6. Gerar Resposta com Histórico (se existir)
    const userPrompt = buildRagPrompt(context, question, lang, mentionedTitles);

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
      const conversation = await this.conversationService.getOrCreateConversation(userId, options.conversationId, question);
      conversationId = conversation.id;
      history = await this.conversationService.getContextMessages(conversationId);
      await this.conversationService.addMessage(conversationId, 'user', question);
    }

    const chunks = await this.hybridSearch(question, options);

    let mentionedContext = '';
    let mentionedTitles: string[] = [];
    if (options.mentionedTrainingIds?.length && userId) {
      const result = await this.buildMentionedCoursesContext(options.mentionedTrainingIds, userId, lang);
      mentionedContext = result.context;
      mentionedTitles = result.titles;
    }

    const { context } = await this.buildContext(chunks, userId, options.maxContextLength || 4000, lang, mentionedContext);
    const userPrompt = buildRagPrompt(context, question, lang, mentionedTitles);

    const stream = await this.aiService.generateStream(userPrompt, {
      ...options.generateOptions,
      language: lang as 'pt' | 'en',
      systemPrompt: options.systemPrompt,
      history,
    }, options.model);

    // Wrap stream to properly await persistence on completion (avoids finalize(async) anti-pattern)
    return new Observable<string>(subscriber => {
      let accumulated = '';
      stream.subscribe({
        next: chunk => { accumulated += chunk; subscriber.next(chunk); },
        error: err => subscriber.error(err),
        complete: async () => {
          if (userId && accumulated) {
            try {
              await this.conversationService.addMessage(conversationId, 'assistant', accumulated);
              this.logger.debug(`Stream finalizado e guardado para conversa: ${conversationId}`);
            } catch (error: any) {
              this.logger.error(`Erro ao guardar resposta de stream: ${error.message}`);
            }
          }
          subscriber.complete();
        },
      });
    });
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

  private async buildContext(chunks: SearchResult[], userId: string | undefined, maxLength: number, lang: string, mentionedContext = '') {
    let context = '';
    const includedChunks: SearchResult[] = [];
    const isEn = lang === 'en';

    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { skills: true }
      });
      if (user) {
        const skills = user.skills?.map(s => `${s.skillName}(${s.level})`).join(', ') || 'N/A';
        const interests = user.interests?.length ? user.interests.join(', ') : 'N/A';
        const profileLines = [
          `Role: ${user.userFunction || 'N/A'}`,
          `Experience level: ${user.experienceLevel || 'N/A'}`,
          `Service line: ${user.serviceLine || 'N/A'}`,
          `Skills (name/level): ${skills}`,
          `Interests: ${interests}`,
        ];
        context += `${isEn ? 'USER PROFILE' : 'PERFIL DO UTILIZADOR'}:\n${profileLines.join('\n')}\n---\n`;
      }
    }

    // Inject mentioned courses context as priority (before hybrid search results)
    if (mentionedContext) {
      context += mentionedContext;
    }

    for (const chunk of chunks) {
      const entry = `[REF:${chunk.id}] ${chunk.content}\n`;
      if ((context + entry).length > maxLength) break;
      context += entry;
      includedChunks.push(chunk);
    }

    return { context, includedChunks };
  }

  private async buildMentionedCoursesContext(
    trainingIds: string[],
    userId: string,
    lang: string,
  ): Promise<{ context: string; titles: string[] }> {
    const isEn = lang === 'en';
    const trainings = await this.prisma.trainingRecord.findMany({
      where: { id: { in: trainingIds }, userId },
      include: { platform: { select: { name: true } } },
    });

    if (!trainings.length) return { context: '', titles: [] };

    const titles: string[] = [];
    let context = isEn ? '### MENTIONED COURSES (user explicitly referenced these):\n' : '### CURSOS MENCIONADOS (referenciados explicitamente pelo utilizador):\n';

    for (const training of trainings) {
      titles.push(training.title);

      const header = isEn
        ? `[MENTIONED: "${training.title}" | Status: ${training.status} | Platform: ${training.platform?.name || 'N/A'}]`
        : `[MENCIONADO: "${training.title}" | Estado: ${training.status} | Plataforma: ${training.platform?.name || 'N/A'}]`;

      // Fetch vector store knowledge about this course
      const chunks = await this.embeddingService.searchSimilar(
        training.title,
        3,
        [ChunkSource.EXTERNAL_COURSE, ChunkSource.COURSE_ANALYSIS],
      );
      const chunkContent = chunks.length
        ? chunks.map(c => c.content).join('\n')
        : '';

      const notes = training.notes
        ? (isEn ? `User notes: ${training.notes}` : `Notas do utilizador: ${training.notes}`)
        : '';

      const progress = training.progressLevel
        ? (isEn ? `Progress: ${training.progressLevel}` : `Progresso: ${training.progressLevel}`)
        : '';

      context += `${header}\n${chunkContent}\n${notes}\n${progress}\n---\n`;
    }

    return { context, titles };
  }

  async getMentionableCourses(userId: string) {
    return this.prisma.trainingRecord.findMany({
      where: {
        userId,
        status: { in: [TrainingStatus.ongoing, TrainingStatus.priority, TrainingStatus.later] },
      },
      select: {
        id: true,
        title: true,
        url: true,
        status: true,
        platform: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { title: 'asc' }],
    });
  }
}
