import { Module } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { SupabaseStorageService } from './supabase-storage.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [CertificatesController],
  providers: [CertificatesService, SupabaseStorageService],
  exports: [CertificatesService, SupabaseStorageService],
})
export class CertificatesModule {}
