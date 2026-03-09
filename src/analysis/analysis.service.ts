import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { EmbeddingService } from '../ai/embedding.service';
import {
  CourseInput,
  buildSummaryPrompt,
  buildTopicsPrompt,
  buildClassificationPrompt,
  buildSimplifyPrompt,
} from './prompt-templates/analysis.template';

export interface CourseClassification {
  type: string;
  level: string;
  targetProfile: string[];
}

export interface CourseAnalysis {
  title: string;
  summary: string;
  simplifiedDescription: string;
  mainTopics: string[];
  classification: CourseClassification;
  indexedInVectorStore: boolean;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private aiService: AiService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Análise completa de um curso:
   * - Resumo curto
   * - Descrição simplificada
   * - Tópicos principais
   * - Classificação (tipo, nível, perfil alvo)
   * - Indexação no vector store
   */
  async analyzeCourse(course: CourseInput): Promise<CourseAnalysis> {
    this.logger.log(`Analisando curso: "${course.title}"`);

    // Executa todas as tarefas de IA em paralelo para maior eficiência
    const [summaryRaw, simplifiedRaw, topicsRaw, classificationRaw] =
      await Promise.all([
        this.aiService.generateText(buildSummaryPrompt(course)),
        this.aiService.generateText(buildSimplifyPrompt(course)),
        this.aiService.generateText(buildTopicsPrompt(course)),
        this.aiService.generateText(buildClassificationPrompt(course)),
      ]);

    // Parsear tópicos (JSON array)
    const mainTopics = this.parseJsonArray(topicsRaw, course.skills ?? []);

    // Parsear classificação (JSON object)
    const classification = this.parseClassification(classificationRaw);

    // Indexar no vector store para pesquisa semântica futura
    let indexedInVectorStore = false;
    try {
      const chunkContent = `${course.title}. ${summaryRaw.trim()}. Tópicos: ${mainTopics.join(', ')}.`;
      await this.embeddingService.indexChunk(chunkContent, {
        source: course.platform ?? 'unknown',
        title: course.title,
        category: course.category,
        type: classification.type,
        level: classification.level,
      });
      indexedInVectorStore = true;
    } catch (err: unknown) {
      this.logger.warn(
        `Não foi possível indexar o curso no vector store: ${(err as Error).message}`,
      );
    }

    return {
      title: course.title,
      summary: summaryRaw.trim(),
      simplifiedDescription: simplifiedRaw.trim(),
      mainTopics,
      classification,
      indexedInVectorStore,
    };
  }

  /**
   * Analisa múltiplos cursos em batch
   */
  async analyzeBatch(courses: CourseInput[]): Promise<CourseAnalysis[]> {
    this.logger.log(`Analisando ${courses.length} cursos em batch...`);
    const results: CourseAnalysis[] = [];
    for (const course of courses) {
      try {
        const analysis = await this.analyzeCourse(course);
        results.push(analysis);
      } catch (err: unknown) {
        this.logger.error(`Erro ao analisar curso "${course.title}": ${(err as Error).message}`);
      }
    }
    return results;
  }

  private parseJsonArray(raw: string, fallback: string[]): string[] {
    try {
      const match = raw.match(/\[.*\]/s);
      if (match) return JSON.parse(match[0]) as string[];
    } catch {
      // ignora erro de parse
    }
    return fallback.length > 0 ? fallback : ['Conteúdo não disponível'];
  }

  private parseClassification(raw: string): CourseClassification {
    try {
      const match = raw.match(/\{.*\}/s);
      if (match) return JSON.parse(match[0]) as CourseClassification;
    } catch {
      // ignora erro de parse
    }
    return { type: 'other', level: 'intermediate', targetProfile: ['mid'] };
  }
}
