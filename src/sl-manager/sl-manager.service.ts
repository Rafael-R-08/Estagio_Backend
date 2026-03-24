import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceLine } from '@prisma/client';

@Injectable()
export class SlManagerService {
  constructor(private prisma: PrismaService) {}

  async getManagerLineId(managerId: string): Promise<ServiceLine> {
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { managedLineId: true },
    });

    if (!manager || !manager.managedLineId) {
      throw new ForbiddenException('You do not have a managed service line assigned.');
    }
    return manager.managedLineId;
  }

  async getManagedUsers(managerId: string) {
    const managedLineId = await this.getManagerLineId(managerId);

    return this.prisma.user.findMany({
      where: {
        serviceLine: managedLineId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        serviceLine: true,
        _count: {
          select: {
            trainings: { where: { status: 'completed' } },
            certificates: true,
          },
        },
      },
    });
  }

  async getUserProgress(managedLineId: ServiceLine, userId: string) {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        trainings: true,
        certificates: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.serviceLine !== managedLineId) {
      throw new ForbiddenException('User does not belong to your managed service line.');
    }

    return {
      userId: user.id,
      name: user.name,
      trainings: user.trainings,
      certificates: user.certificates,
    };
  }
}
