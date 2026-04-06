// src/ai/ai.module.ts
import { Module, forwardRef } from '@nestjs/common';
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
import { CoursePlanService } from './services/course-plan.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SearchModule),
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
    CoursePlanService,
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
    CoursePlanService,
  ],
})
export class AiModule {}
