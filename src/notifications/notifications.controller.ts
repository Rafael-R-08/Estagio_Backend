import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificações do utilizador autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Notificações retornadas com sucesso',
  })
  findAll(
    @CurrentUser() userId: string,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findForUser(userId, query);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  @ApiResponse({ status: 200, description: 'Notificação marcada como lida' })
  @ApiResponse({ status: 404, description: 'Notificação não encontrada' })
  markAsRead(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar todas as notificações como lidas' })
  @ApiResponse({
    status: 200,
    description: 'Todas as notificações marcadas como lidas',
  })
  markAllAsRead(@CurrentUser() userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}
