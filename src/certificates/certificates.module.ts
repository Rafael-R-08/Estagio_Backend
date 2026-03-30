import { Module } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { SupabaseStorageService } from './supabase-storage.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { PdfProcessor } from './processors/pdf.processor';
import { PdfService } from './pdf.service';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    ConfigModule,
    BullModule.registerQueue({
      name: 'pdf-processing',
    }),
  ],
  controllers: [CertificatesController],
  providers: [CertificatesService, SupabaseStorageService, PdfProcessor, PdfService],
  exports: [CertificatesService, SupabaseStorageService, PdfService],
})
export class CertificatesModule {}
