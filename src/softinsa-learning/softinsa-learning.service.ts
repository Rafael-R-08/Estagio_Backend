import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSoftinsaLearningDto } from './dto/create-softinsa-learning.dto';
import { UpdateSoftinsaLearningDto } from './dto/update-softinsa-learning.dto';

@Injectable()
export class SoftinsaLearningService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSoftinsaLearningDto) {
    return this.prisma.softinsaLearning.create({ data: dto });
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

  /** Full-text keyword search (used by SoftinsaLearningAdapter) */
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
