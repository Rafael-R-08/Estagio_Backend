// src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiService } from './services/ai.service';
import { EmbeddingService } from './services/embedding.service';
import { IndexingService } from './services/indexing.service';
import { IndexingSeedService } from './services/indexing-seed.service';
import { RecommendationService } from './services/recommendation.service';
import { RagService } from './services/rag.service';
import { AnalysisService } from './services/analysis.service';
import { CourseIndexingListener } from './listeners/course-indexing.listener';
import { AiController } from './ai.controller';

import { PrismaModule } from '../prisma/prisma.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    PrismaModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    AiController
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
    IndexingSeedService,
    RecommendationService,
    RagService, 
    AnalysisService
  ],
})
export class AiModule {}
