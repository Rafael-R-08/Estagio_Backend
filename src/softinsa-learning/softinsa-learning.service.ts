// src/softinsa-learning/softinsa-learning.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSoftinsaLearningDto } from './dto/create-softinsa-learning.dto';
import { UpdateSoftinsaLearningDto } from './dto/update-softinsa-learning.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CourseCreatedEvent } from '../ai/events/course-indexing.event';
import { ChunkSource } from '@prisma/client';

@Injectable()
export class SoftinsaLearningService {
  private readonly logger = new Logger(SoftinsaLearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Cria uma nova formação interna e emite evento para indexação semântica.
   */
  async create(dto: CreateSoftinsaLearningDto) {
    this.logger.log(`Criando nova formação interna: ${dto.title}`);
    const learning = await this.prisma.softinsaLearning.create({ data: dto });
    
    try {
      // Emitir evento para o sistema de IA indexar automaticamente
      this.eventEmitter.emit('softinsa_learning.created', new CourseCreatedEvent(
        learning.id,
        learning.title,
        learning.description,
        'Softinsa Learning',
        learning.department || undefined,
        learning.level || undefined,
        ChunkSource.SOFTINSA_LEARNING
      ));
    } catch (error) {
      this.logger.error(`Falha ao emitir evento de indexação: ${error.message}`);
    }

    return learning;
  }

  findAll(department?: string, mandatory?: boolean) {
    return this.prisma.softinsaLearning.findMany({
      where: {
        ...(department ? { department } : {}),
        ...(mandatory !== undefined ? { mandatory } : {}),
      },
      orderBy: [{ mandatory: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.softinsaLearning.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Formação interna não encontrada');
    return item;
  }

  async update(id: string, dto: UpdateSoftinsaLearningDto) {
    await this.findOne(id);
    return this.prisma.softinsaLearning.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.softinsaLearning.delete({ where: { id } });
    return { message: 'Formação interna eliminada com sucesso' };
  }

  /**
   * Pesquisa por palavras-chave (usado pelo SearchService)
   */
  search(terms: string[], limit: number) {
    const orConditions = terms.flatMap((t) => [
      { title: { contains: t, mode: 'insensitive' as const } },
      { description: { contains: t, mode: 'insensitive' as const } },
      { skills: { has: t } },
    ]);

    return this.prisma.softinsaLearning.findMany({
      where: { OR: orConditions },
      orderBy: [{ mandatory: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }
}
