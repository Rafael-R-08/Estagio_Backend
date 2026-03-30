// src/ai/ai.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmbeddingService } from './services/embedding.service';
import { AiService } from './services/ai.service';
import { IndexingService } from './services/indexing.service';
import { RecommendationService } from './services/recommendation.service';
import { RagService } from './services/rag.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';

@ApiTags('AI & Knowledge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly aiService: AiService,
    private readonly indexingService: IndexingService,
    private readonly recommendationService: RecommendationService,
    private readonly ragService: RagService,
  ) { }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Verifica o estado de saúde do motor de IA (Health Check)' })
  async health() {
    const start = Date.now();
    try {
      // Teste simples de embedding
      await this.embeddingService.embed('health check');
      const ragStats = await this.embeddingService.getStats();

      return {
        status: 'UP',
        engine: 'llama-3.3-70b-versatile',
        embeddingModel: 'xenova-384d',
        ragStats,
        latency_ms: Date.now() - start,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'DOWN',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('generate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Gera texto via LLM (Autenticado)' })
  async generate(@CurrentUser() userId: string, @Body() dto: { prompt: string; model?: string }) {
    return this.aiService.generateText(dto.prompt, { userId }, dto.model);
  }

  @Post('embed')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Gera embedding para um texto' })
  async embed(@Body() dto: { text: string }) {
    const embedding = await this.embeddingService.embed(dto.text);
    return { embedding, dimensions: embedding.length };
  }

  @Post('index-chunk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Indexa manualmente um chunk (Admin)' })
  async indexChunk(@Body() dto: { content: string; source?: any; metadata?: any }) {
    return this.embeddingService.indexChunk(dto.content, dto.source, undefined, dto.metadata);
  }

  @Get('search-chunks')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Pesquisa direta no vector store (Admin)' })
  async searchChunks(@Query('q') query: string, @Query('limit') limit?: string) {
    return this.embeddingService.searchSimilar(query, limit ? parseInt(limit, 10) : 5);
  }

  @Get('chunks')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Lista chunks (Admin)' })
  async listChunks(@Query('limit') limit?: string) {
    return this.embeddingService.listChunks(limit ? parseInt(limit, 10) : 10);
  }

  @Delete('chunks')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Limpa todo o vector store (Admin)' })
  async deleteAllChunks() {
    await this.embeddingService.deleteAll();
  }

  @Delete('chunks/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteChunk(@Param('id') id: string) {
    return this.embeddingService.deleteChunk(id);
  }

  @Get('indexing-stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Estatísticas de indexação' })
  async getIndexingStats() {
    return this.indexingService.getIndexingStats();
  }

  @Post('recommendations')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Gera recomendações personalizadas RAG' })
  async getRecommendations(@CurrentUser() userId: string) {
    return this.recommendationService.recommendForUser(userId);
  }



  @Post('chat/stream')
  @Sse()
  @ApiOperation({ summary: 'Chat em tempo real via SSE (Streaming + RAG)' })
  async streamChat(
    @CurrentUser() userId: string,
    @Body() dto: { prompt: string; model?: string }
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.ragService.queryStream(dto.prompt, {
      model: dto.model,
      generateOptions: { userId },
    });

    return stream.pipe(
      map(data => ({ data } as MessageEvent)),
    );
  }
}
