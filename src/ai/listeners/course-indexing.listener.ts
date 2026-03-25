// src/ai/listeners/course-indexing.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IndexingService } from '../services/indexing.service';
import { CourseCreatedEvent, CourseBatchCreatedEvent } from '../events/course-indexing.event';

@Injectable()
export class CourseIndexingListener {
  private readonly logger = new Logger(CourseIndexingListener.name);

  constructor(private readonly indexingService: IndexingService) {}

  @OnEvent('course.created')
  async handleCourseCreated(event: CourseCreatedEvent) {
    this.logger.debug(`Evento 'course.created' recebido para: ${event.courseId}`);
    try {
      await this.indexingService.indexCourse(event);
    } catch (error) {
      this.logger.error(`Erro ao processar event course.created: ${error.message}`);
    }
  }

  @OnEvent('course.batch_created')
  async handleCourseBatchCreated(event: CourseBatchCreatedEvent) {
    this.logger.debug(`Evento 'course.batch_created' recebido com ${event.courses.length} cursos`);
    try {
      await this.indexingService.indexCourseBatch(event);
    } catch (error) {
      this.logger.error(`Erro ao processar event course.batch_created: ${error.message}`);
    }
  }

  @OnEvent('softinsa_learning.created')
  async handleSoftinsaLearningCreated(event: CourseCreatedEvent) {
    this.logger.debug(`Evento 'softinsa_learning.created' recebido para: ${event.courseId}`);
    try {
      // Garante que o source está correto para Softinsa
      const slEvent = { ...event, source: 'SOFTINSA_LEARNING' as any };
      await this.indexingService.indexCourse(slEvent);
    } catch (error) {
      this.logger.error(`Erro ao processar event softinsa_learning.created: ${error.message}`);
    }
  }
}
