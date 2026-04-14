import {
  Controller,
  Post,
  Delete,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@ApiTags('Push Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Obter a VAPID public key para o frontend' })
  @ApiOkResponse({ description: 'VAPID public key' })
  getVapidPublicKey() {
    return { vapidPublicKey: this.pushService.getVapidPublicKey() };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Guardar Push Subscription do browser' })
  @ApiCreatedResponse({ description: 'Subscrição registada' })
  subscribe(@CurrentUser() userId: string, @Body() dto: SubscribePushDto) {
    return this.pushService.subscribe(userId, dto);
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover Push Subscription' })
  @ApiNoContentResponse({ description: 'Subscrição removida' })
  unsubscribe(
    @CurrentUser() userId: string,
    @Body() body: { endpoint: string },
  ) {
    return this.pushService.unsubscribe(userId, body.endpoint);
  }
}
