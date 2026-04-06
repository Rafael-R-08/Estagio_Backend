import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class UpdateSettingsDto {
  @IsOptional() @IsBoolean() notifyWeeklyRecs?: boolean;
  @IsOptional() @IsBoolean() notifyCertExpiry?: boolean;
  @IsOptional() @IsBoolean() notifyProgress?: boolean;
  @IsOptional() @IsBoolean() notifyByEmail?: boolean;
  @IsOptional() @IsBoolean() notifyInApp?: boolean;
  @IsOptional() @IsString()  uiLanguage?: string;
}

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
