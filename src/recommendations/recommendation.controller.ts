import { Controller, Post, Body, Get, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RecommendationService } from './recommendation.service';

class RecommendQueryDto {
  @ApiPropertyOptional({
    description: 'Query personalizada (opcional — se não fornecida, é gerada automaticamente com base no perfil)',
    example: 'Quero aprender cloud computing e DevOps',
  })
  @IsOptional()
  @IsString()
  query?: string;
}

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationController {
  constructor(private recommendationService: RecommendationService) {}

  /**
   * POST /recommendations/me
   * Recomendações personalizadas para o utilizador autenticado
   */
  @Post('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recomendações personalizadas baseadas no perfil e histórico do utilizador autenticado',
  })
  async recommendForMe(@Request() req, @Body() dto: RecommendQueryDto) {
    return this.recommendationService.recommendForUser(req.user.userId, dto.query);
  }

  /**
   * GET /recommendations/me
   * Recomendações automáticas sem query (usa perfil do utilizador)
   */
  @Get('me')
  @ApiOperation({
    summary: 'Recomendações automáticas baseadas no perfil (sem necessidade de query)',
  })
  async autoRecommend(@Request() req) {
    return this.recommendationService.recommendForUser(req.user.userId);
  }
}
