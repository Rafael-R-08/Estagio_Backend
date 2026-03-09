import { Module, Global } from '@nestjs/common';
import { OllamaQueueService } from './ollama-queue.service';

@Global()
@Module({
  providers: [OllamaQueueService],
  exports: [OllamaQueueService],
})
export class OllamaCacheModule {}
