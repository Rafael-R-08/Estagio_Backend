import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { AnalyzeCourseDto, AnalyzeBatchDto } from './dto/analyze-course.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private analysisService: AnalysisService) {}

  /**
   * POST /analysis/course
   * Análise completa de um curso com IA
   */
  @Post('course')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analisa um curso com IA: resumo, tópicos, classificação e indexação',
  })
  @ApiResponse({ status: 200, description: 'Análise completa do curso' })
  async analyzeCourse(@Body() dto: AnalyzeCourseDto) {
    return await this.analysisService.analyzeCourse(dto);
  }

  /**
   * POST /analysis/batch
   * Análise em batch de múltiplos cursos
   */
  @Post('batch')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analisa múltiplos cursos em batch',
  })
  @ApiResponse({ status: 200, description: 'Resultados da análise em batch' })
  async analyzeBatch(@Body() dto: AnalyzeBatchDto) {
    return await this.analysisService.analyzeBatch(dto.courses);
  }
}
