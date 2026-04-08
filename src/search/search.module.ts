import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { CacheModule } from '../cache/cache.module';
import { CourseDbService } from './course-db.service';
import { SemanticRankingService } from './semantic-ranking.service';
import { CourseEnrichmentService } from './course-enrichment.service';
import { SearchOrchestratorService } from './search-orchestrator.service';
import { MicrosoftLearnAdapter } from './adapters/microsoft-learn.adapter';
import { UdemyAdapter } from './adapters/udemy.adapter';
import { IbmSkillsBuildAdapter } from './adapters/ibm-skillsbuild.adapter';
import { AcademiaPortugalDigitalAdapter } from './adapters/academia-portugal-digital.adapter';
import { TrailheadAdapter } from './adapters/trailhead.adapter';
import { SoftinsaEverydayLearningAdapter } from './adapters/softinsa-el.adapter';
import { PlatformRegistry } from './platform.registry';
import { CatalogSyncService } from './catalog-sync.service';

import { forwardRef } from '@nestjs/common';

@Module({
  imports: [HttpModule, PrismaModule, forwardRef(() => AiModule), CacheModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    PlatformRegistry,
    CourseDbService,
    SemanticRankingService,
    CourseEnrichmentService,
    SearchOrchestratorService,
    MicrosoftLearnAdapter,
    UdemyAdapter,
    IbmSkillsBuildAdapter,
    AcademiaPortugalDigitalAdapter,
    TrailheadAdapter,
    SoftinsaEverydayLearningAdapter,
    CatalogSyncService,
  ],
  exports: [SearchService, PlatformRegistry, SearchOrchestratorService, CourseDbService, CatalogSyncService],
})
export class SearchModule {}
