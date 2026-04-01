// src/ai/services/indexing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
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
    this.logger.log(`A processar indexação de curso: ${event.externalId} (${event.source})`);

    try {
      // 1. Idempotência: Verificar se já existe chunk para este externalId + source
      const existing = await this.prisma.textChunk.findFirst({
        where: { sourceId: event.externalId, source: event.source }
      });

      if (existing) {
        this.logger.debug(`Curso ${event.externalId} já indexado. Ignorando.`);
        return existing;
      }

      const content = this.buildCourseChunkContent(event);
      const metadata = this.buildMetadata(event);

      // 2. Criar novo chunk (Embedding Service encapsula a lógica vetorial)
      const result = await this.embeddingService.indexChunk(
        content,
        event.source,
        event.externalId,
        metadata,
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `Erro ao indexar curso ${event.externalId}: ${error.message}`,
      );
      return null;
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

    const BATCH_SIZE = 3;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const currentBatchIdx = Math.floor(i / BATCH_SIZE) + 1;
      const batch = courses.slice(i, i + BATCH_SIZE);

      this.logger.debug(
        `Processando Batch ${currentBatchIdx}/${totalBatches}...`,
      );
      await Promise.allSettled(batch.map((course) => this.indexCourse(course)));

      if (i + BATCH_SIZE < total) {
        this.logger.log(
          `Batch ${currentBatchIdx}/${totalBatches} concluído. A aguardar 15s para respeitar rate limits...`,
        );
        await this.sleep(15000);
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
      PROVEDOR: ${event.provider || 'N/A'}
      CATEGORIA: ${event.category || 'N/A'}
      NÍVEL: ${event.difficulty || 'N/A'}
      DESCRIÇÃO: ${event.description || 'Sem descrição.'}
    `.trim();
  }

  private buildMetadata(event: CourseCreatedEvent): Record<string, any> {
    return {
      externalId: event.externalId,
      platformId: event.platformId,
      platform: event.provider,
      category: event.category,
      level: event.difficulty,
      indexedAt: new Date().toISOString(),
    };
  }

  @Cron(EVERY_DAY_AT_3AM)
  async handleDailyReindex() {
    this.logger.log(
      'Iniciando verificação diária de cursos não indexados...',
    );
    await this.reindexMissingCourses();
  }

  private async reindexMissingCourses() {
    try {
      this.logger.log('Sincronizando Vector Store com a tabela de Courses...');
      
      // 1. Obter IDs já indexados para o source EXTERNAL_COURSE
      const indexed = await this.prisma.textChunk.findMany({
        where: { source: ChunkSource.EXTERNAL_COURSE },
        select: { sourceId: true }
      });
      const indexedIds = new Set(indexed.map(i => i.sourceId).filter(Boolean));

      // 2. Obter todos os cursos da base de dados
      const allCourses = await this.prisma.course.findMany({
        include: { platform: true }
      });

      // 3. Filtrar os que faltam
      const missing = allCourses.filter(c => !indexedIds.has(c.externalId));
      
      if (missing.length === 0) {
        this.logger.log('Todos os cursos estão indexados corretamente no Vector Store.');
        return;
      }

      this.logger.log(`Encontrados ${missing.length} cursos sem indexação semântica. Iniciando processo...`);

      // 4. Mapear para eventos
      const events: CourseCreatedEvent[] = missing.map(c => ({
        externalId: c.externalId,
        platformId: c.platformId,
        title: c.title,
        description: c.description,
        provider: c.platform.name,
        category: c.tags?.[0] || 'Geral',
        difficulty: c.level || undefined,
        source: ChunkSource.EXTERNAL_COURSE
      }));

      // 5. Processar via Batch
      await this.indexCourseBatch({ courses: events });
      
    } catch (error) {
      this.logger.error(`Erro ao reindexar cursos em falta: ${error.message}`);
    }
  }

  async getIndexingStats() {
    return this.embeddingService.getStats();
  }
}
