import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('progress')
  @ApiOperation({
    summary: 'Relatório de progressão do utilizador (perfil + formações + certificados + skills)',
    description:
      'Devolve um DTO estruturado com todos os dados de aprendizagem. O frontend pode usar este DTO para gerar um PDF com jsPDF ou react-pdf.',
  })
  @ApiOkResponse({ description: 'Relatório de progressão do utilizador autenticado' })
  getProgressReport(@CurrentUser() userId: string) {
    return this.reportsService.getProgressReport(userId);
  }
}
