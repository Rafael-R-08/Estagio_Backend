import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [AnalysisController],
})
export class AnalysisModule {}
