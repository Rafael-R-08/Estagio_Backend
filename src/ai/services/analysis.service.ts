// src/ai/services/analysis.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { EmbeddingService } from './embedding.service';
import { ChunkSource } from '@prisma/client';
import { 
  buildSummaryPrompt, 
  buildTopicsPrompt, 
  buildClassificationPrompt, 
  buildSimplifyPrompt 
} from '../templates/analysis.template';

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
   * Análise completa de um curso e indexação
   */
  async analyzeCourse(course: any): Promise<CourseAnalysis> {
    this.logger.log(`Analisando curso: "${course.title}"`);

    // Geração de conteúdo via IA usando templates
    const [summaryRaw, simplifiedRaw, topicsRaw, classificationRaw] =
      await Promise.all([
        this.aiService.generateText(buildSummaryPrompt(course)),
        this.aiService.generateText(buildSimplifyPrompt(course)),
        this.aiService.generateText(buildTopicsPrompt(course)),
        this.aiService.generateText(buildClassificationPrompt(course)),
      ]);

    const mainTopics = this.parseJsonArray(topicsRaw);
    const classification = this.parseClassification(classificationRaw);

    let indexedInVectorStore = false;
    try {
      const chunkContent = `CURSO: ${course.title}. RESUMO: ${summaryRaw.trim()}. TÓPICOS: ${mainTopics.join(', ')}. NÍVEL: ${classification.level}.`;
      
      await this.embeddingService.indexChunk(
        chunkContent, 
        ChunkSource.COURSE_ANALYSIS, 
        course.id, 
        {
          title: course.title,
          type: classification.type,
          level: classification.level,
        }
      );
      indexedInVectorStore = true;
    } catch (err: any) {
      this.logger.warn(`Falha na indexação automática: ${err.message}`);
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
  async analyzeBatch(courses: any[]): Promise<CourseAnalysis[]> {
    this.logger.log(`Analisando ${courses.length} cursos em batch...`);
    const results: CourseAnalysis[] = [];
    for (const course of courses) {
      try {
        const analysis = await this.analyzeCourse(course);
        results.push(analysis);
      } catch (err: any) {
        this.logger.error(`Erro ao analisar curso "${course.title}": ${err.message}`);
      }
    }
    return results;
  }

  private parseJsonArray(raw: string): string[] {
    try {
      const match = raw.match(/\[.*\]/s);
      if (match) return JSON.parse(match[0]) as string[];
    } catch {}
    return ['Geral'];
  }

  private parseClassification(raw: string): CourseClassification {
    try {
      const match = raw.match(/\{.*\}/s);
      if (match) return JSON.parse(match[0]) as CourseClassification;
    } catch {}
    return { type: 'course', level: 'intermediate', targetProfile: ['tech'] };
  }
}
