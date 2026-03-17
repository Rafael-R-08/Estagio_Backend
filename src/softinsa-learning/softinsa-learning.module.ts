import { Module } from '@nestjs/common';
import { SoftinsaLearningController } from './softinsa-learning.controller';
import { SoftinsaLearningService } from './softinsa-learning.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SoftinsaLearningController],
  providers: [SoftinsaLearningService],
  exports: [SoftinsaLearningService],
})
export class SoftinsaLearningModule {}
