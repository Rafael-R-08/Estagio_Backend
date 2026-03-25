// src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiService } from './services/ai.service';
import { EmbeddingService } from './services/embedding.service';
import { IndexingService } from './services/indexing.service';
import { IndexingSeedService } from './services/indexing-seed.service';
import { RecommendationService } from './services/recommendation.service.js';
import { RagService } from './services/rag.service.js';
import { AnalysisService } from './services/analysis.service.js';
import { CourseIndexingListener } from './listeners/course-indexing.listener';
import { AiController } from './ai.controller';
import { RagController } from '../rag/rag.controller';
import { RecommendationController } from '../recommendations/recommendation.controller';
import { AnalysisController } from '../analysis/analysis.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    PrismaModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    AiController,
    RagController,
    RecommendationController,
    AnalysisController
  ],
  providers: [
    AiService,
    EmbeddingService,
    IndexingService,
    IndexingSeedService,
    RecommendationService,
    RagService,
    AnalysisService,
    CourseIndexingListener,
  ],
  exports: [
    AiService, 
    EmbeddingService, 
    IndexingService, 
    RecommendationService, 
    RagService, 
    AnalysisService
  ],
})
export class AiModule {}
