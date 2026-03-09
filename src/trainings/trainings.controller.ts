import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrainingsService } from './trainings.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { FilterTrainingDto } from './dto/filter-training.dto';

interface AuthRequest {
  user: { userId: string };
}

@ApiTags('Trainings')
@ApiBearerAuth()
@Controller('trainings')
export class TrainingsController {
  constructor(private readonly trainingsService: TrainingsService) {}

  /**
   * POST /trainings
   * Adicionar curso ao registo pessoal
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adicionar formação ao registo pessoal' })
  @ApiResponse({ status: 201, description: 'Registo criado' })
  create(@Req() req: AuthRequest, @Body() dto: CreateTrainingDto) {
    const userId = req.user.userId;
    return this.trainingsService.create(userId, dto);
  }

  /**
   * GET /trainings/me
   * Listar as minhas formações (com filtros)
   */
  @Get('me')
  @ApiOperation({ summary: 'Listar as minhas formações' })
  @ApiResponse({ status: 200, description: 'Lista de registos' })
  findAll(@Req() req: AuthRequest, @Query() filters: FilterTrainingDto) {
    const userId = req.user.userId;
    return this.trainingsService.findAll(userId, filters);
  }

  /**
   * GET /trainings/me/stats
   * Estatísticas pessoais de formação
   */
  @Get('me/stats')
  @ApiOperation({ summary: 'Estatísticas pessoais (horas, status, rating médio)' })
  @ApiResponse({ status: 200, description: 'Estatísticas do utilizador' })
  getStats(@Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.trainingsService.getStats(userId);
  }

  /**
   * GET /trainings/:id
   * Obter um registo específico
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obter registo de formação por ID' })
  @ApiResponse({ status: 200, description: 'Registo encontrado' })
  @ApiResponse({ status: 404, description: 'Registo não encontrado' })
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.trainingsService.findOne(userId, id);
  }

  /**
   * PATCH /trainings/:id
   * Atualizar estado, notas, rating, etc.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar registo de formação' })
  @ApiResponse({ status: 200, description: 'Registo atualizado' })
  @ApiResponse({ status: 404, description: 'Registo não encontrado' })
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTrainingDto,
  ) {
    const userId = req.user.userId;
    return this.trainingsService.update(userId, id, dto);
  }

  /**
   * DELETE /trainings/:id
   * Remover registo de formação
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar registo de formação' })
  @ApiResponse({ status: 200, description: 'Registo eliminado' })
  @ApiResponse({ status: 404, description: 'Registo não encontrado' })
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.trainingsService.remove(userId, id);
  }
}
