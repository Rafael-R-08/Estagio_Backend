import { Module } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { AzureBlobService } from './azure-blob.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [CertificatesController],
  providers: [CertificatesService, AzureBlobService],
  exports: [CertificatesService, AzureBlobService],
})
export class CertificatesModule {}
