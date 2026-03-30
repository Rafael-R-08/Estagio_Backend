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
import { TrackAccessDto } from './dto/track-access.dto';

import { AddDocumentDto } from './dto/add-document.dto';

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
   * POST /trainings/:id/documents
   * Anexar documento a uma formação
   */
  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Anexar documento a uma formação' })
  addDocument(
    @Req() req: AuthRequest, 
    @Param('id') id: string, 
    @Body() dto: AddDocumentDto
  ) {
    const userId = req.user.userId;
    return this.trainingsService.addDocument(userId, id, dto.fileUrl, dto.fileName);
  }

  /**
   * DELETE /trainings/:id/documents/:docId
   * Remover documento anexado
   */
  @Delete(':id/documents/:docId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover documento anexado' })
  removeDocument(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('docId') docId: string
  ) {
    const userId = req.user.userId;
    return this.trainingsService.removeDocument(userId, id, docId);
  }

  /**
   * POST /trainings/track-access
   * Registar o clique num resultado de pesquisa para dar feedback no futuro
   */
  @Post('track-access')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registar acesso a um curso' })
  @ApiResponse({ status: 201, description: 'Registo de acesso criado/devolvido' })
  trackAccess(@Req() req: AuthRequest, @Body() dto: TrackAccessDto) {
    const userId = req.user.userId;
    return this.trainingsService.trackAccess(userId, dto);
  }

  /**
   * POST /trainings/add-to-plan
   * Guardar curso nos planos (para fazer mais tarde)
   */
  @Post('add-to-plan')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Guardar curso nos planos' })
  @ApiResponse({ status: 201, description: 'Curso adicionado aos planos' })
  addToPlan(@Req() req: AuthRequest, @Body() dto: TrackAccessDto) {
    const userId = req.user.userId;
    return this.trainingsService.addToPlan(userId, dto);
  }

  /**
   * POST /trainings/start
   * Iniciar formação imediatamente
   */
  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Iniciar formação' })
  @ApiResponse({ status: 201, description: 'Formação iniciada' })
  startTraining(@Req() req: AuthRequest, @Body() dto: TrackAccessDto) {
    const userId = req.user.userId;
    return this.trainingsService.startTraining(userId, dto);
  }

  /**
   * GET /trainings/pending-feedback
   * Retorna todas as formações que o utilizador clicou na pesquisa mas que ainda têm status "accessed"
   */
  @Get('pending-feedback')
  @ApiOperation({ summary: 'Listar cursos pendentes de feedback (status = accessed)' })
  @ApiResponse({ status: 200, description: 'Lista de registos pendentes' })
  getPendingFeedback(@Req() req: AuthRequest) {
    const userId = req.user.userId;
    return this.trainingsService.getPendingFeedback(userId);
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
