import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'Obter definições do utilizador autenticado' })
  getSettings(@CurrentUser() userId: string) {
    return this.auth.getSettings(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualizar definições do utilizador autenticado' })
  updateSettings(@CurrentUser() userId: string, @Body() dto: UpdateSettingsDto) {
    return this.auth.upsertSettings(userId, dto);
  }
}
