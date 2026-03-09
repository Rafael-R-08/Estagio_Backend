import {
  Controller,
  Get,
  Query,
  Param,
  Req,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

interface AuthRequest extends Request {
  user: { userId: string };
}

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('platforms')
  @ApiOperation({ summary: 'Lista todas as plataformas de pesquisa disponíveis' })
  getAvailablePlatforms() {
    return this.searchService.getAvailablePlatforms();
  }

  @Get('course/:externalId')
  @ApiOperation({ summary: 'Detalhe de um curso pelo externalId (da cache)' })
  async getCourse(@Param('externalId') externalId: string) {
    const course = await this.searchService.getCourseByExternalId(externalId);
    if (!course) throw new NotFoundException('Curso não encontrado na cache.');
    return course;
  }

  @Get('course/:externalId/related')
  @ApiOperation({ summary: 'Cursos relacionados' })
  getRelated(@Param('externalId') externalId: string) {
    return this.searchService.getRelatedCourses(externalId);
  }

  @Get()
  @ApiOperation({
    summary: 'Pesquisa unificada em todas as plataformas activas',
    description:
      'Combina resultados de Microsoft Learn e Academia Portugal Digital com ranking semântico via embeddings.',
  })
  async search(@Query() dto: SearchQueryDto, @Req() req: AuthRequest) {
    // userId pode ser undefined em rotas públicas — aqui é autenticado (JWT)
    const userId = req.user?.userId;
    return this.searchService.search(dto, userId);
  }
}
