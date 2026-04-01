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
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { TrainingsService } from './trainings.service';
import { SupabaseStorageService } from '../certificates/supabase-storage.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { FilterTrainingDto } from './dto/filter-training.dto';
import { TrackAccessDto } from './dto/track-access.dto';

import { AddDocumentDto } from './dto/add-document.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

interface AuthRequest {
  user: { userId: string };
}

@ApiTags('Trainings')
@ApiBearerAuth()
@Controller('trainings')
export class TrainingsController {
  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly storageService: SupabaseStorageService,
  ) {}

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
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Anexar documento a uma formação (Upload ou Link)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        fileUrl: { type: 'string' },
        fileName: { type: 'string' },
      },
    },
  })
  async addDocument(
    @Req() req: any, 
    @Param('id') id: string, 
    @Body() dto: AddDocumentDto,
    @UploadedFile() file?: any
  ) {
    const userId = req.user.userId;
    
    // Log de emergência para depurar o que o frontend está a enviar
    console.log('[UPLOAD DEBUG] Body:', req.body);
    console.log('[UPLOAD DEBUG] File:', file ? file.originalname : 'MISSING');
    console.log('[UPLOAD DEBUG] Content-Type:', req.headers['content-type']);

    let finalUrl = dto.fileUrl;
    let finalName = dto.fileName;

    if (file) {
      finalUrl = await this.storageService.uploadFile(file, 'docs', 'training');
      finalName = finalName || file.originalname;
    }

    if (!finalUrl) {
      throw new BadRequestException('Erro de Validação: Não recebemos o ficheiro ou o URL. Verifica se no FormData estás a usar a chave "file".');
    }

    return this.trainingsService.addDocument(userId, id, finalUrl, finalName || 'Documento sem nome');
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

  @Get() // Alias para GET /api/trainings
  @Get('me')
  @ApiOperation({ summary: 'Listar as minhas formações' })
  @ApiResponse({ status: 200, description: 'Lista de registos' })
  findAll(@Req() req: any, @Query() filters: FilterTrainingDto) {
    const userId = req.user?.userId;
    if (!userId) return []; // Fallback seguro
    return this.trainingsService.findAll(userId, filters);
  }

  /**
   * GET /trainings/stats
   * GET /trainings/me/stats
   * Estatísticas pessoais de formação
   */
  @Get('stats')  // Alias para GET /api/trainings/stats
  @Get('me/stats')
  @ApiOperation({ summary: 'Estatísticas pessoais (horas, status, rating médio)' })
  @ApiResponse({ status: 200, description: 'Estatísticas do utilizador' })
  getStats(@Req() req: any) {
    const userId = req.user?.userId;
    if (!userId) return null; // Fallback seguro
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
   * POST /trainings/:id/resources
   * Adicionar recurso ao quadro
   */
  @Post(':id/resources')
  @UseInterceptors(FilesInterceptor('files'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adicionar recurso ao quadro (Trello)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        title: { type: 'string' },
        content: { type: 'string' },
        position: { type: 'number' },
      },
    },
  })
  async addResource(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateResourceDto,
    @UploadedFiles() files?: any[]
  ) {
    const userId = req.user.userId;
    const uploadedFiles: { fileUrl: string; fileName: string }[] = [];
    if (files && files.length > 0) {
      for (const f of files) {
        const url = await this.storageService.uploadFile(f, 'docs', 'training-resource');
        uploadedFiles.push({ fileUrl: url, fileName: f.originalname });
      }
    }

    return this.trainingsService.addResource(userId, id, dto, uploadedFiles);
  }

  /**
   * PATCH /trainings/:id/resources/:resId
   * Atualizar recurso do quadro
   */
  @Patch(':id/resources/:resId')
  @ApiOperation({ summary: 'Atualizar recurso do quadro' })
  async updateResource(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('resId') resId: string,
    @Body() dto: UpdateResourceDto,
  ) {
    const userId = req.user.userId;
    return this.trainingsService.updateResource(userId, id, resId, dto);
  }

  /**
   * POST /trainings/:id/resources/:resId/files
   * Adicionar ficheiro específico a um recurso
   */
  @Post(':id/resources/:resId/files')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Anexar ficheiro extra a recurso do quadro' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async addResourceFile(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('resId') resId: string,
    @UploadedFile() file: any
  ) {
    if (!file) throw new BadRequestException('Ficheiro obrigatório.');
    const userId = req.user.userId;
    const finalUrl = await this.storageService.uploadFile(file, 'docs', 'training-resource');
    const finalName = file.originalname;
    return this.trainingsService.addResourceFile(userId, id, resId, finalUrl, finalName);
  }

  /**
   * DELETE /trainings/:id/resources/:resId/files/:fileId
   * Remover ficheiro específico de um recurso
   */
  @Delete(':id/resources/:resId/files/:fileId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover ficheiro do recurso' })
  removeResourceFile(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('resId') resId: string,
    @Param('fileId') fileId: string
  ) {
    const userId = req.user.userId;
    return this.trainingsService.removeResourceFile(userId, id, resId, fileId);
  }

  /**
   * DELETE /trainings/:id/resources/:resId
   * Remover recurso do quadro
   */
  @Delete(':id/resources/:resId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover recurso do quadro' })
  removeResource(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('resId') resId: string
  ) {
    const userId = req.user.userId;
    return this.trainingsService.removeResource(userId, id, resId);
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
