// src/ai/services/indexing-seed.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IndexingService } from './indexing.service';
import {
  CourseCreatedEvent,
  CourseBatchCreatedEvent,
} from '../events/course-indexing.event';
import { ChunkSource } from '@prisma/client';

@Injectable()
export class IndexingSeedService implements OnModuleInit {
  private readonly logger = new Logger(IndexingSeedService.name);
  private isSeeding = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly indexingService: IndexingService,
  ) {}

  async onModuleInit() {
    const count = await this.prisma.textChunk.count();

    if (count === 0) {
      this.logger.log(
        'TextChunk está vazio. Iniciando seed automático de indexação em background...',
      );
      // Fire-and-forget: does not block app startup
      this.seedFromExistingData().catch((err) =>
        this.logger.error(`Erro no seed automático: ${err.message}`),
      );
    } else {
      this.logger.log(
        `Conhecimento já indexado (${count} chunks). Seed ignorado.`,
      );
    }
  }

  async seedFromExistingData() {
    if (this.isSeeding) {
      this.logger.warn(
        'Seed já em curso. Pedido ignorado para evitar duplicação.',
      );
      return;
    }

    this.isSeeding = true;
    this.logger.log('A carregar cursos das tabelas base para indexação...');

    try {
      // 1. Cursos Externos
      const courses = await this.prisma.course.findMany({
        include: { platform: true },
      });

      const courseEvents = courses.map(
        (c) =>
          new CourseCreatedEvent(
            c.externalId,
            c.platformId,
            c.title,
            c.description,
            c.platform?.name || 'Unknown',
            c.tags?.[0] || 'Geral',
            c.level || undefined,
            ChunkSource.EXTERNAL_COURSE,
            c.durationHours ?? undefined,
            c.language ?? undefined,
            c.isFree ?? undefined,
            c.rating ?? undefined,
          ),
      );

      const allEvents = [...courseEvents];

      if (allEvents.length > 0) {
        const estMinutes = Math.ceil(allEvents.length / 24);
        this.logger.log(
          `Encontrados ${allEvents.length} cursos para indexar. Estimativa: ~${estMinutes} minutos (rate limit: 24 req/min)`,
        );

        await this.indexingService.indexCourseBatch(
          new CourseBatchCreatedEvent(allEvents),
        );
        this.logger.log(
          `Seed completo: ${allEvents.length} cursos processados.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Falha no seed de indexação: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isSeeding = false;
    }
  }
}
