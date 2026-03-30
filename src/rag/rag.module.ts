import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [RagController],
})
export class RagModule {}
