import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { EmbeddingService } from './embedding.service';
import { ChunkSource } from '@prisma/client';
import { buildFullCourseAnalysisPrompt } from '../templates/analysis.template';
import { JsonSafeParser } from '../parsers/json-safe.parser';
import { CourseClassificationSchema, CourseClassificationOutput } from '../parsers/ai.schemas';
import { z } from 'zod';

/**
 * Schema completo para a análise de curso interno.
 */
const FullAnalysisSchema = z.object({
  summary: z.string(),
  simplifiedDescription: z.string(),
  mainTopics: z.array(z.string()),
  classification: CourseClassificationSchema,
});

type FullAnalysisOutput = z.infer<typeof FullAnalysisSchema>;

export interface CourseAnalysis extends CourseClassificationOutput {
  title: string;
  summary: string;
  simplifiedDescription: string;
  mainTopics: string[];
  indexedInVectorStore: boolean;
  classification?: CourseClassificationOutput; // Para compatibilidade se necessário
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private aiService: AiService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Análise unificada de curso (Uma única chamada LLM para análise completa).
   */
  async analyzeCourse(course: any): Promise<CourseAnalysis | null> {
    this.logger.log(`Análise Enterprise: "${course.title}"`);

    const prompt = buildFullCourseAnalysisPrompt(course);
    
    // Chamada única com JSON Mode — sem cache para garantir análises independentes por curso
    const rawResponse = await this.aiService.generateText(prompt, {
      responseFormat: 'json_object',
      temperature: 0.1,
      noCache: true,
    });

    const validated = JsonSafeParser.parse(rawResponse, FullAnalysisSchema);

    if (!validated) {
      this.logger.error(`Falha ao validar análise do curso: ${course.title}`);
      return null;
    }

    let indexedInVectorStore = false;
    try {
      const chunkContent = `CURSO: ${course.title}. RESUMO: ${validated.summary}. TÓPICOS: ${validated.mainTopics.join(', ')}. NÍVEL: ${validated.classification.level}.`;
      
      await this.embeddingService.indexChunk(
        chunkContent, 
        ChunkSource.COURSE_ANALYSIS, 
        course.id, 
        {
          title: course.title,
          type: validated.classification.type,
          level: validated.classification.level,
        }
      );
      indexedInVectorStore = true;
    } catch (err: any) {
      this.logger.warn(`Indexação falhou: ${err.message}`);
    }

    return {
      title: course.title,
      summary: validated.summary,
      simplifiedDescription: validated.simplifiedDescription,
      mainTopics: validated.mainTopics,
      type: validated.classification.type,
      level: validated.classification.level,
      targetProfile: validated.classification.targetProfile,
      classification: validated.classification,
      indexedInVectorStore,
    };
  }

  async analyzeBatch(courses: any[]): Promise<CourseAnalysis[]> {
    this.logger.log(`Analisando ${courses.length} cursos em paralelo (Batch Limit 5)...`);
    const results: CourseAnalysis[] = [];
    
    // Processamento em pequenos lotes para evitar overload
    const batchSize = 5;
    for (let i = 0; i < courses.length; i += batchSize) {
      const batch = courses.slice(i, i + batchSize);
      const analyses = await Promise.all(batch.map(c => this.analyzeCourse(c)));
      results.push(...(analyses.filter(a => a !== null) as CourseAnalysis[]));
    }
    
    return results;
  }
}
