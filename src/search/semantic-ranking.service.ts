import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../ai/services/embedding.service';
import { CourseResult } from './interfaces/platform-adapter.interface';
import { ChunkSource } from '@prisma/client';

@Injectable()
export class SemanticRankingService {
  private readonly logger = new Logger(SemanticRankingService.name);

  constructor(private readonly embeddingService: EmbeddingService) {}

  /**
   * Ordena os resultados com base na similaridade semântica com a query.
   * Utiliza uma combinação de pesquisa vetorial na BD e cálculo on-the-fly.
   */
  async rankResults(query: string, courses: CourseResult[]): Promise<CourseResult[]> {
    if (courses.length === 0) return [];

    try {
      // 1. Procurar similaridade no Vector Store local (para cursos já indexados)
      const similarKnowledge = await this.embeddingService.searchSimilar(
        query,
        30, // Pegamos um top razoável
        [ChunkSource.EXTERNAL_COURSE, ChunkSource.COURSE_ANALYSIS]
      );

      const knowledgeMap = new Map(
        similarKnowledge
          .filter(k => k.sourceId)
          .map(k => [k.sourceId, k.similarity])
      );

      // 2. Embedding da query para cálculo on-the-fly dos novos resultados
      const queryVector = await this.embeddingService.embed(query);
      
      const ranked = await Promise.all(courses.map(async (course) => {
        // Prioridade 1: Score do Vector Store (mais preciso se o chunk for rico)
        let score = knowledgeMap.get(course.externalId) || 0;

        // Prioridade 2: Cálculo on-the-fly se for curso novo/não indexado
        if (score < 0.1) {
           const courseText = `${course.title} ${course.description} ${course.tags.join(' ')}`;
           // Nota: embed() já é normalizado e rápido via Xenova
           const courseVector = await this.embeddingService.embed(courseText.slice(0, 1000));
           score = this.cosineSimilarity(queryVector, courseVector);
        }

        return { 
          ...course, 
          similarityScore: parseFloat(score.toFixed(4)) 
        };
      }));

      return ranked.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));
    } catch (error) {
      this.logger.error(`Erro no ranking semântico: ${error.message}`);
      // Fallback: Retorna sem score mas mantém os dados
      return courses;
    }
  }

  /**
   * Similaridade Cosseno manual (fallback ou validação)
   */
  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dotProduct += v1[i] * v2[i];
        mag1 += v1[i] * v1[i];
        mag2 += v2[i] * v2[i];
    }
    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}
