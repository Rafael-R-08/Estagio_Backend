import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddCourseToCollectionDto } from './dto/add-course-to-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCollectionDto) {
    return this.prisma.collection.create({
      data: { userId, name: dto.name, description: dto.description },
    });
  }

  async findAll(userId: string) {
    return this.prisma.collection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { courses: true } } },
    });
  }

  async findOne(id: string, userId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: { courses: { orderBy: { addedAt: 'desc' } } },
    });
    if (!collection) throw new NotFoundException('Coleção não encontrada');
    if (collection.userId !== userId) throw new ForbiddenException();
    return collection;
  }

  async update(id: string, userId: string, dto: UpdateCollectionDto) {
    await this.assertOwner(id, userId);
    return this.prisma.collection.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });
  }

  async remove(id: string, userId: string) {
    await this.assertOwner(id, userId);
    await this.prisma.collection.delete({ where: { id } });
  }

  async addCourse(id: string, userId: string, dto: AddCourseToCollectionDto) {
    await this.assertOwner(id, userId);
    const existing = await this.prisma.collectionCourse.findUnique({
      where: { collectionId_externalId: { collectionId: id, externalId: dto.externalId } },
    });
    if (existing) throw new ConflictException('O curso já existe nesta coleção');
    return this.prisma.collectionCourse.create({
      data: {
        collectionId: id,
        externalId: dto.externalId,
        title: dto.title,
        url: dto.url,
        platformId: dto.platformId,
      },
    });
  }

  async removeCourse(id: string, userId: string, externalId: string) {
    await this.assertOwner(id, userId);
    const course = await this.prisma.collectionCourse.findUnique({
      where: { collectionId_externalId: { collectionId: id, externalId } },
    });
    if (!course) throw new NotFoundException('Curso não encontrado na coleção');
    await this.prisma.collectionCourse.delete({ where: { id: course.id } });
  }

  private async assertOwner(id: string, userId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!collection) throw new NotFoundException('Coleção não encontrada');
    if (collection.userId !== userId) throw new ForbiddenException();
  }
}
