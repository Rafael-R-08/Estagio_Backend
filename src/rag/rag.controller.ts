import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RagService } from '../ai/services/rag.service';
import { RecommendationService } from '../ai/services/recommendation.service';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagRecommendDto } from './dto/rag-recommend.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('rag')
@ApiBearerAuth()
@Controller('rag')
export class RagController {
  constructor(
    private ragService: RagService,
    private recommendationService: RecommendationService,
  ) {}

  /**
   * POST /rag/query
   * Pipeline RAG completo: pesquisa semântica + resposta do LLM
   */
  @Post('query')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Faz uma pergunta usando o pipeline RAG' })
  @ApiResponse({
    status: 200,
    description: 'Resposta gerada pelo LLM com fontes',
  })
  async query(
    @Body() dto: RagQueryDto,
    @CurrentUser() userId?: string
  ) {
    return this.ragService.query(dto.query, { 
      topK: dto.topK,
      generateOptions: { userId }
    });
  }

  /**
   * POST /rag/recommend
   * Recomendações personalizadas baseadas no perfil do utilizador
   */
  @Post('recommend')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Recomendações personalizadas baseadas no perfil do utilizador',
  })
  @ApiResponse({
    status: 200,
    description: 'Recomendações geradas pelo LLM com fontes',
  })
  async recommend(
    @Body() dto: RagRecommendDto,
    @CurrentUser() userId?: string
  ) {
    return this.recommendationService.recommendForUser(
      userId,
      dto.query,
      dto.topK,
    );
  }

  /**
   * GET /rag/welcome
   * Mensagem de boas-vindas inicial
   */
  @Get('welcome')
  @Public()
  @ApiOperation({ summary: 'Obtém a mensagem de boas-vindas do assistente' })
  async welcome(@CurrentUser() userId?: string) {
    const welcome = await this.ragService.getWelcomeMessage(userId);
    return { welcome };
  }
}
