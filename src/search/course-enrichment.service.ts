import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseResult } from './interfaces/platform-adapter.interface';

@Injectable()
export class CourseEnrichmentService {
  private readonly logger = new Logger(CourseEnrichmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adiciona estatísticas internas do Softinsa Learning Hub (TrainingRecords) aos cursos.
   * Permite ordenar por popularidade ou rating interno da equipa.
   */
  async enrichWithInternalStats(courses: CourseResult[]): Promise<CourseResult[]> {
    if (courses.length === 0) return [];

    try {
      // 1. Obter estatísticas de TrainingRecord agregadas por URL (chave universal)
      const urls = courses.map(c => c.url);
      const stats = await this.prisma.trainingRecord.groupBy({
        by: ['url'],
        where: { url: { in: urls } },
        _avg: { rating: true, relevance: true },
        _count: { id: true },
      });

      const statsMap = new Map(stats.map(s => [s.url, s]));

      // 2. Mapear para os objetos CourseResult
      return courses.map(course => {
        const s = statsMap.get(course.url);
        if (!s) return course;

        return {
          ...course,
          // rating interno médio (ex: 4.5/5)
          internalRating: s._avg.rating ? parseFloat(s._avg.rating.toFixed(2)) : undefined,
          // relevância interna média da equipa
          internalRelevance: s._avg.relevance ? parseFloat(s._avg.relevance.toFixed(2)) : undefined,
          // número de vezes que foi concluído na Softinsa
          completedCount: s._count.id || 0,
        };
      });
    } catch (error) {
      this.logger.error(`Erro ao enriquecer cursos com estatísticas internas: ${error.message}`);
      return courses;
    }
  }

  /**
   * Adiciona o estado do utilizador autenticado para cada curso (guardado, frequentado, realizado, etc.).
   * Usa a URL como chave universal para cruzar com TrainingRecord.
   */
  async enrichWithUserStatus(courses: CourseResult[], userId: string): Promise<CourseResult[]> {
    if (courses.length === 0 || !userId) return courses;

    try {
      const urls = courses.map(c => c.url);
      const records = await this.prisma.trainingRecord.findMany({
        where: { userId, url: { in: urls } },
        select: { url: true, status: true },
      });

      // Em caso de múltiplos registos para o mesmo URL, prioridade: completed > ongoing > priority > later > accessed > cancelled
      const priorityOrder = ['completed', 'ongoing', 'priority', 'later', 'accessed', 'cancelled'];
      const statusMap = new Map<string, string>();
      for (const r of records) {
        const existing = statusMap.get(r.url);
        if (!existing || priorityOrder.indexOf(r.status) < priorityOrder.indexOf(existing)) {
          statusMap.set(r.url, r.status);
        }
      }

      return courses.map(course => {
        const status = statusMap.get(course.url);
        if (!status) return course;
        return { ...course, userStatus: status };
      });
    } catch (error) {
      this.logger.error(`Erro ao enriquecer cursos com estado do utilizador: ${error.message}`);
      return courses;
    }
  }
}
