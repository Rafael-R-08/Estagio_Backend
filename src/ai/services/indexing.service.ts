// src/ai/services/indexing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service.js';
import { ChunkSource } from '@prisma/client';

import { CourseCreatedEvent, CourseBatchCreatedEvent } from '../events/course-indexing.event';
import { Cron } from '@nestjs/schedule';

const EVERY_DAY_AT_3AM = '0 3 * * *';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Delay helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Indexa um único curso. Verifica duplicados pelo sourceId.
   */
  async indexCourse(event: CourseCreatedEvent) {
    this.logger.log(`A processar indexação de curso: ${event.courseId} (${event.source})`);

    try {
      // 1. Verificar se já existe chunk para este sourceId
      const existing = await this.prisma.textChunk.findFirst({
        where: { sourceId: event.courseId, source: event.source }
      });

      if (existing) {
        this.logger.debug(`Curso ${event.courseId} já indexado. Ignorando.`);
        return existing;
      }

      const content = this.buildCourseChunkContent(event);
      const metadata = this.buildMetadata(event);

      // 2. Criar novo chunk
      return await this.embeddingService.indexChunk(
        content,
        event.source,
        event.courseId,
        metadata
      );
    } catch (error) {
      this.logger.error(`Erro ao indexar curso ${event.courseId}: ${error.message}`);
    }
  }

  /**
   * Indexa um lote de cursos em paralelo respeitando rate limits
   * Limite GitHub Models: 5 concorrentes / 24 req/min
   */
  async indexCourseBatch(event: CourseBatchCreatedEvent) {
    const courses = event.courses;
    const total = courses.length;
    this.logger.log(`A iniciar indexação de batch: ${total} cursos.`);

    // Batch de 3 para ficar abaixo dos 5 concorrentes da API
    const BATCH_SIZE = 3;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const currentBatchIdx = Math.floor(i / BATCH_SIZE) + 1;
      const batch = courses.slice(i, i + BATCH_SIZE);
      
      this.logger.debug(`Processando Batch ${currentBatchIdx}/${totalBatches}...`);
      await Promise.allSettled(batch.map(course => this.indexCourse(course)));

      if (i + BATCH_SIZE < total) {
        this.logger.log(`Batch ${currentBatchIdx}/${totalBatches} concluído. A aguardar 8s antes do próximo para respeitar rate limits...`);
        // 24 req/min = 1 req a cada 2.5s. Com batch de 3: 3 * 2.5s = 7.5s (esperamos 8s)
        await this.sleep(8000);
      }
    }

    this.logger.log(`Batch total de ${total} cursos finalizado.`);
  }

  /**
   * Constrói o conteúdo textual do curso para embedding
   */
  private buildCourseChunkContent(event: CourseCreatedEvent): string {
    return `
      CURSO: ${event.title}
      PROVEDOR: ${event.provider}
      CATEGORIA: ${event.category || 'N/A'}
      NÍVEL: ${event.difficulty || 'N/A'}
      DESCRIÇÃO: ${event.description || 'Sem descrição.'}
    `.trim();
  }

  private buildMetadata(event: CourseCreatedEvent): Record<string, any> {
    return {
      courseId: event.courseId,
      platform: event.provider,
      category: event.category,
      level: event.difficulty,
      indexedAt: new Date().toISOString()
    };
  }

  @Cron(EVERY_DAY_AT_3AM)
  async handleDailyReindex() {
    this.logger.log('Iniciando verificação diária de cursos não indexados...');
    await this.reindexMissingCourses();
  }

  private async reindexMissingCourses() {
    // Placeholder para lógica futura
  }

  async getIndexingStats() {
    return this.embeddingService.getStats();
  }
}
