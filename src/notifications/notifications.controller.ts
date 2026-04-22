import {
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable, fromEvent, map } from 'rxjs';
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
import { EventEmitter2 } from '@nestjs/event-emitter';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

  @Get('unread-count')
  @ApiOperation({ summary: 'Obter contagem de notificações não lidas (leve, para badge)' })
  @ApiResponse({ status: 200, description: 'Contagem de não lidas' })
  async getUnreadCount(@CurrentUser() userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Stream SSE de novas notificações em tempo real' })
  stream(@CurrentUser() userId: string): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, `notification.new.${userId}`).pipe(
      map((notification) => ({ data: notification }) as MessageEvent),
    );
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

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar todas as notificações do utilizador' })
  @ApiResponse({ status: 200, description: 'Todas as notificações eliminadas' })
  deleteAll(@CurrentUser() userId: string) {
    return this.notificationsService.deleteAll(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar notificação por ID' })
  @ApiResponse({ status: 204, description: 'Notificação eliminada' })
  @ApiResponse({ status: 404, description: 'Notificação não encontrada' })
  async deleteOne(@Param('id') id: string, @CurrentUser() userId: string) {
    await this.notificationsService.deleteOne(id, userId);
  }
}
