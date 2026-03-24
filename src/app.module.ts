import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ScraperModule } from './scraper/scraper.module';
import { AiModule } from './ai/ai.module';
import { RagModule } from './rag/rag.module';
import { RecommendationModule } from './recommendations/recommendation.module';
import { AnalysisModule } from './analysis/analysis.module';
import { TrainingsModule } from './trainings/trainings.module';
import { CertificatesModule } from './certificates/certificates.module';
import { SearchModule } from './search/search.module';
import { CacheModule } from './cache/cache.module';
import { AdminModule } from './admin/admin.module';
import { SoftinsaLearningModule } from './softinsa-learning/softinsa-learning.module';
import { SlManagerModule } from './sl-manager/sl-manager.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { GlobalAuthGuard } from './common/guards/auth-global.guard';
import { RolesGlobalGuard } from './common/guards/roles-global.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import configuration from './config/configuration';
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]), // 30 pedidos/min por IP
    CacheModule,
    PrismaModule,
    AuthModule,
    UserModule,
    ScraperModule,
    AiModule,
    RagModule,
    RecommendationModule,
    AnalysisModule,
    TrainingsModule,
    CertificatesModule,
    SearchModule,
    AdminModule,
    SoftinsaLearningModule,
    SlManagerModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: GlobalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGlobalGuard },
  ],
})
export class AppModule {}
