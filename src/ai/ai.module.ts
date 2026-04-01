// src/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AiService } from './services/ai.service';
import { EmbeddingService } from './services/embedding.service';
import { IndexingService } from './services/indexing.service';
import { IndexingSeedService } from './services/indexing-seed.service';
import { RecommendationService } from './services/recommendation.service';
import { RagService } from './services/rag.service';
import { AnalysisService } from './services/analysis.service';
import { ConversationService } from './services/conversation.service';
import { MetadataExtractionService } from './extractors/metadata-extraction.service';
import { CourseIndexingListener } from './listeners/course-indexing.listener';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SearchModule),
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
    ConversationService,
    MetadataExtractionService,
    CourseIndexingListener,
  ],
  exports: [
    AiService, 
    EmbeddingService, 
    IndexingService,
    IndexingSeedService,
    RecommendationService,
    RagService, 
    AnalysisService,
    ConversationService,
    MetadataExtractionService,
  ],
})
export class AiModule {}
