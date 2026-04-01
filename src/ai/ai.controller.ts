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
import { ConversationService } from './services/conversation.service';
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
    private readonly conversationService: ConversationService,
  ) { }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Verifica saúde da IA (Groq + pgvector)' })
  async health() {
    const ragStats = await this.embeddingService.getStats();
    return {
      status: 'UP',
      engine: 'Groq Llama 3.3',
      embeddingModel: 'Xenova 384d',
      ragStats,
    };
  }

  @Post('recommendations')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Gera recomendações personalizadas ultra-precisas' })
  async getRecommendations(@CurrentUser() userId: string) {
    return this.recommendationService.recommendForUser(userId);
  }

  @Post('recommendations/welcome')
  @Get('recommendations/welcome')
  @Public()
  @ApiOperation({ summary: 'Obtém a mensagem de boas-vindas do assistente' })
  async getWelcome(@CurrentUser() userId?: string) {
    const welcome = await this.ragService.getWelcomeMessage(userId);
    return { welcome };
  }

  /**
   * --- CHAT & CONVERSAÇÕES ---
   */

  @Post('chat/stream')
  @Sse()
  @ApiOperation({ summary: 'Chat SSE com memória e busca híbrida' })
  async streamChat(
    @CurrentUser() userId: string,
    @Body() dto: { prompt: string; conversationId?: string }
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.ragService.queryStream(dto.prompt, {
      conversationId: dto.conversationId,
      generateOptions: { userId },
    });

    return stream.pipe(
      map(data => ({ data } as MessageEvent)),
    );
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat síncrono (não-stream)' })
  async simpleChat(
    @CurrentUser() userId: string,
    @Body() dto: { prompt: string; conversationId?: string }
  ) {
    return this.ragService.query(dto.prompt, {
      conversationId: dto.conversationId,
      generateOptions: { userId },
    });
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Lista conversas do utilizador' })
  async listConversations(@CurrentUser() userId: string) {
    return this.conversationService.listUserConversations(userId);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Apaga uma conversa' })
  async deleteConversation(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.conversationService.deleteConversation(id, userId);
    return { status: 'deleted' };
  }

  /**
   * --- ADMIN & INDEXING ---
   */

  @Get('indexing-stats')
  @Roles('ADMIN')
  async getIndexingStats() {
    return this.indexingService.getIndexingStats();
  }

  @Delete('chunks')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAllChunks() {
    await this.embeddingService.deleteAll();
  }
}
