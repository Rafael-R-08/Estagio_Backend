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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmbeddingService } from './services/embedding.service';
import { AiService } from './services/ai.service';
import { IndexingService } from './services/indexing.service';
import { RecommendationService } from './services/recommendation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

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
  ) {}

  @Post('generate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Gera texto via LLM (Autenticado)' })
  async generate(@CurrentUser() userId: string, @Body() dto: { prompt: string; model?: string }) {
    return this.aiService.generateText(dto.prompt, { userId }, dto.model);
  }

  @Post('embed')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Gera embedding para um texto' })
  async embed(@Body() dto: { text: string; model?: string }) {
    const embedding = await this.aiService.embed(dto.text, dto.model);
    return { embedding, dimensions: embedding.length };
  }

  @Post('index-chunk')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Indexa manualmente um chunk (Admin)' })
  async indexChunk(@Body() dto: { content: string; source?: any; metadata?: any }) {
    // Chama searchSimilar ou indexChunk com os argumentos corretos
    return this.embeddingService.indexChunk(dto.content, dto.source, undefined, dto.metadata);
  }

  @Get('search-chunks')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Pesquisa direta no vector store (Admin)' })
  async searchChunks(@Query('q') query: string, @Query('limit') limit?: string) {
    return this.embeddingService.searchChunks(query, limit ? parseInt(limit, 10) : 5);
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

  @Post('recommendations/feedback')
  @ApiOperation({ summary: 'Submete feedback de recomendação' })
  async saveFeedback(@CurrentUser() userId: string, @Body() dto: any) {
    return this.recommendationService.saveFeedback(userId, dto);
  }
}
