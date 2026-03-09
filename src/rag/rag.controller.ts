import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RagService } from './rag.service';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagRecommendDto } from './dto/rag-recommend.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(private ragService: RagService) {}

  /**
   * POST /rag/query
   * Pipeline RAG completo: pesquisa semântica + resposta do LLM
   */
  @Post('query')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Faz uma pergunta usando o pipeline RAG' })
  @ApiResponse({
    status: 200,
    description: 'Resposta gerada pelo LLM com fontes',
  })
  async query(@Body() dto: RagQueryDto) {
    return this.ragService.query(dto.query, dto.topK);
  }

  /**
   * POST /rag/recommend
   * Recomendações personalizadas baseadas no perfil do utilizador
   */
  @Post('recommend')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recomendações personalizadas baseadas no perfil do utilizador',
  })
  @ApiResponse({
    status: 200,
    description: 'Recomendações geradas pelo LLM com fontes',
  })
  async recommend(@Body() dto: RagRecommendDto) {
    return this.ragService.recommend(dto.query, dto.userProfile, dto.topK);
  }
}
