import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [RecommendationController],
})
export class RecommendationsModule {}
