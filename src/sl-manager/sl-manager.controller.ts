import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SlManagerService } from './sl-manager.service';

@ApiTags('Service Line Manager')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sl-manager')
@Roles('SERVICE_LINE_MANAGER')
export class SlManagerController {
  constructor(private readonly slManagerService: SlManagerService) {}

  // ── Overview ──────────────────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'KPIs e estatísticas agregadas da service line' })
  @ApiOkResponse({
    description:
      'Total de membros, distribuição por nível, estatísticas de formações e certificados',
  })
  @ApiForbiddenResponse({ description: 'Acesso restrito a SERVICE_LINE_MANAGER' })
  getOverview(@CurrentUser() managerId: string) {
    return this.slManagerService.getLineOverview(managerId);
  }

  // ── User list ─────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Tabela de utilizadores da service line' })
  @ApiOkResponse({
    description:
      'Lista com nome, função, nível, estado, formações concluídas, certificados ativos e alertas',
  })
  @ApiForbiddenResponse({ description: 'Acesso restrito a SERVICE_LINE_MANAGER' })
  getUsers(@CurrentUser() managerId: string) {
    return this.slManagerService.getManagedUsers(managerId);
  }

  // ── User detail ───────────────────────────────────────────────────────────

  @Get('users/:id')
  @ApiOperation({ summary: 'Perfil detalhado de um membro da service line' })
  @ApiParam({ name: 'id', description: 'ID do utilizador' })
  @ApiOkResponse({
    description:
      'Perfil completo: formações, certificados (com validade), skills e sumário de aprendizagem',
  })
  @ApiNotFoundResponse({ description: 'Utilizador não encontrado' })
  @ApiForbiddenResponse({ description: 'Utilizador não pertence à sua service line' })
  getUserDetail(@Param('id') id: string, @CurrentUser() managerId: string) {
    return this.slManagerService.getUserDetail(managerId, id);
  }

  // ── Alerts ────────────────────────────────────────────────────────────────

  @Get('alerts')
  @ApiOperation({ summary: 'Alertas acionáveis da service line' })
  @ApiOkResponse({
    description:
      'Certificados a expirar (critical/warning/info), utilizadores inativos há 60+ dias e utilizadores sem formações',
  })
  @ApiForbiddenResponse({ description: 'Acesso restrito a SERVICE_LINE_MANAGER' })
  getAlerts(@CurrentUser() managerId: string) {
    return this.slManagerService.getLineAlerts(managerId);
  }

  // ── Legacy ────────────────────────────────────────────────────────────────

  @Get('users/:id/progress')
  @ApiOperation({
    summary: '[Deprecated] Progresso do utilizador — usar GET /sl-manager/users/:id',
    deprecated: true,
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiNotFoundResponse({ description: 'Utilizador não encontrado' })
  @ApiForbiddenResponse({ description: 'Utilizador não pertence à sua service line' })
  async getUserProgress(@Param('id') id: string, @CurrentUser() managerId: string) {
    return this.slManagerService.getUserDetail(managerId, id);
  }

  // ── Activity feed ─────────────────────────────────────────────────────────

  @Get('activity')
  @ApiOperation({ summary: 'Feed de atividade cronológica da service line' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Máximo de eventos (default: 30)' })
  @ApiOkResponse({
    description: 'Lista de eventos: enrolled, completed, certificate ordenados por data',
  })
  @ApiForbiddenResponse({ description: 'Acesso restrito a SERVICE_LINE_MANAGER' })
  getActivityFeed(
    @CurrentUser() managerId: string,
    @Query('limit') limit?: string,
  ) {
    return this.slManagerService.getActivityFeed(managerId, limit ? parseInt(limit, 10) : 30);
  }
}
