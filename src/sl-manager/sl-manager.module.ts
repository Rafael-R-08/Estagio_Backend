import { Module } from '@nestjs/common';
import { SlManagerController } from './sl-manager.controller';
import { SlManagerService } from './sl-manager.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SlManagerController],
  providers: [SlManagerService],
})
export class SlManagerModule {}
