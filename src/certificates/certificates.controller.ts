import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { multerCertificatesConfig } from './multer.config';

interface AuthRequest {
  user: { userId: string };
}

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  /**
   * POST /certificates
   * Upload de certificado + extração automática de metadados com IA
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', multerCertificatesConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Fazer upload de certificado (extração automática com IA)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'trainingId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Ficheiro PDF ou imagem (máx 10MB)' },
        trainingId: { type: 'string', description: 'ID do registo de formação' },
        courseName: { type: 'string' },
        provider: { type: 'string' },
        completionDate: { type: 'string', format: 'date-time' },
        expirationDate: { type: 'string', format: 'date-time' },
        durationHours: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Certificado criado com metadados extraídos' })
  async create(
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateCertificateDto,
  ) {
    if (!file) throw new BadRequestException('Ficheiro obrigatório.');
    return this.certificatesService.create(req.user.userId, file, dto);
  }

  /**
   * GET /certificates/me
   * Listar os meus certificados
   */
  @Get('me')
  @ApiOperation({ summary: 'Listar os meus certificados' })
  @ApiResponse({ status: 200, description: 'Lista de certificados' })
  findAll(@Req() req: AuthRequest) {
    return this.certificatesService.findAll(req.user.userId);
  }

  /**
   * GET /certificates/expiring
   * Certificados a expirar nos próximos N dias (default: 30)
   */
  @Get('expiring')
  @ApiOperation({ summary: 'Certificados a expirar nos próximos 30 dias' })
  @ApiResponse({ status: 200, description: 'Lista de certificados a expirar' })
  findExpiring(@Req() req: AuthRequest, @Query('days') days?: string) {
    return this.certificatesService.findExpiring(req.user.userId, days ? parseInt(days) : 30);
  }

  /**
   * GET /certificates/renewal-alerts
   * Devolve sugerencias inteligentes baseadas nos meses-chave preferidos do user
   */
  @Get('renewal-alerts')
  @ApiOperation({ summary: 'Obter alertas inteligentes de renovação baseados no limite escolhido pelo utilizador' })
  @ApiResponse({ status: 200, description: 'Alertas rigorosos e reciclagens sugeridas de conhecimento antigo' })
  getRenewalAlerts(@Req() req: AuthRequest) {
    return this.certificatesService.getRenewalAlerts(req.user.userId);
  }

  /**
   * GET /certificates/:id
   * Ver certificado específico
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obter certificado por ID' })
  @ApiResponse({ status: 200, description: 'Certificado encontrado' })
  @ApiResponse({ status: 404, description: 'Não encontrado' })
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.certificatesService.findOne(req.user.userId, id);
  }

  /**
   * PATCH /certificates/:id
   * Editar metadados de um certificado
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar metadados do certificado' })
  @ApiResponse({ status: 200, description: 'Certificado actualizado' })
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCertificateDto,
  ) {
    return this.certificatesService.update(req.user.userId, id, dto);
  }

  /**
   * POST /certificates/:id/reextract
   * Re-executar extração de metadados com IA
   */
  @Post(':id/reextract')
  @ApiOperation({ summary: 'Re-extrair metadados com IA' })
  @ApiResponse({ status: 200, description: 'Metadados actualizados' })
  reextract(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.certificatesService.reextract(req.user.userId, id);
  }

  /**
   * DELETE /certificates/:id
   * Eliminar certificado e ficheiro
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar certificado' })
  @ApiResponse({ status: 200, description: 'Eliminado' })
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.certificatesService.remove(req.user.userId, id);
  }
}
