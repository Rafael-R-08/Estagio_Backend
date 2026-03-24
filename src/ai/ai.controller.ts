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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { AiService } from './ai.service';
import { IndexChunkDto } from './dto/index-chunk.dto';
import { SearchChunksDto } from './dto/search-chunks.dto';
import { GenerateTextDto } from './dto/generate-text.dto';
import { Public } from '../common/decorators/public.decorator';
import { EmbedTextDto } from './dto/embed-text.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /api/ai/index-chunk
   * Indexa um chunk de texto com embedding
   */
  @Post('index-chunk')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async indexChunk(@Body() dto: IndexChunkDto) {
    return this.embeddingService.indexChunk(dto.content, dto.metadata);
  }

  /**
   * GET /api/ai/search-chunks?query=...&limit=5
   * Pesquisa chunks similares por similaridade semântica
   */
  @Get('search-chunks')
  @Public()
  async searchChunks(@Query() dto: SearchChunksDto) {
    return this.embeddingService.searchChunks(dto.query, dto.limit);
  }

  /**
   * GET /api/ai/chunks
   * Lista todos os chunks indexados
   */
  @Get('chunks')
  @Public()
  async listChunks(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.embeddingService.listChunks(limitNum);
  }

  /**
   * DELETE /api/ai/chunks
   * Deleta todos os chunks (útil para testes)
   */
  @Delete('chunks')
  @Public()
  @HttpCode(HttpStatus.OK)
  async deleteAllChunks() {
    return this.embeddingService.deleteAllChunks();
  }

  /**
   * DELETE /api/ai/chunks/:id
   * Deleta um chunk específico
   */
  @Delete('chunks/:id')
  @Public()
  @HttpCode(HttpStatus.OK)
  async deleteChunk(@Param('id') id: string) {
    return this.embeddingService.deleteChunk(id);
  }

  /**
   * POST /api/ai/generate
   * Gera texto usando LLM (endpoint de teste)
   */
  @Post('generate')
  @Public()
  async generateText(@Body() dto: GenerateTextDto) {
    const response = await this.aiService.generateText(dto.prompt, dto.model);
    return { prompt: dto.prompt, response, model: dto.model };
  }

  /**
   * POST /api/ai/embed
   * Gera embedding para um texto (endpoint de teste)
   */
  @Post('embed')
  @Public()
  async embedText(@Body() dto: EmbedTextDto) {
    const embedding = await this.aiService.embed(dto.text, dto.model);
    return {
      text: dto.text,
      embedding,
      dimensions: embedding.length,
      model: dto.model || this.configService.get('githubModels.embedModel'),
    };
  }

  @Get('stats')
  @Public()
  getStats() {
    return {};
  }
}
