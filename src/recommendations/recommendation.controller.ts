import { Controller, Post, Body, Get, HttpCode, HttpStatus, UseGuards, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RecommendationService } from '../ai/services/recommendation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationController {
  constructor(
    private recommendationService: RecommendationService,
  ) {}

  /**
   * POST /recommendations/me
   * Recomendações personalizadas para o utilizador autenticado
   */
  @Post('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recomendações personalizadas baseadas no perfil e histórico do utilizador autenticado',
  })
  async recommendForMe(@CurrentUser() userId: string, @Body() dto: RecommendQueryDto) {
    return this.recommendationService.recommendForUser(userId, dto.query);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Recomendações automáticas baseadas no perfil (sem necessidade de query)',
  })
  async autoRecommend(@CurrentUser() userId: string) {
    return this.recommendationService.recommendForUser(userId);
  }

  /**
   * DELETE /recommendations/me/cache
   * Invalida a cache e gera novas recomendações para o utilizador autenticado
   */
  @Delete('me/cache')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Força nova geração de recomendações (ignora cache)',
  })
  async refreshRecommendations(@CurrentUser() userId: string) {
    return this.recommendationService.recommendForUser(userId, undefined, undefined, true);
  }
}
