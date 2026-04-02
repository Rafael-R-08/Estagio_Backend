import { Module, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AiModule } from './ai/ai.module';
import { TrainingsModule } from './trainings/trainings.module';
import { CertificatesModule } from './certificates/certificates.module';
import { SearchModule } from './search/search.module';
import { CacheModule } from './cache/cache.module';
import { AdminModule } from './admin/admin.module';
import { SlManagerModule } from './sl-manager/sl-manager.module';
import { RagModule } from './rag/rag.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { AnalysisModule } from './analysis/analysis.module';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { GlobalAuthGuard } from './common/guards/auth-global.guard';
import { RolesGlobalGuard } from './common/guards/roles-global.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
        },
      }),
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 100 },
    ]),
    CacheModule,
    PrismaModule,
    AuthModule,
    UserModule,
    AiModule,
    TrainingsModule,
    CertificatesModule,
    SearchModule,
    AdminModule,
    SlManagerModule,
    RagModule,
    RecommendationsModule,
    AnalysisModule,
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
export class AppModule {
  private readonly logger = new Logger(AppModule.name);

  onModuleInit() {
    this.logger.log('LearningHub Backend inicializado com sucesso.');
  }
}
