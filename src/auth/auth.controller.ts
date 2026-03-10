// src/auth/auth.controller.ts
import { Body, Controller, Get, Post, Patch, Query, HttpCode, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../common/decorators/public.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Registar novo utilizador' })
  @ApiResponse({ status: 201, description: 'Utilizador criado com sucesso' })
  @ApiResponse({ status: 409, description: 'Email já está em uso' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Login de utilizador' })
  @ApiResponse({ status: 200, description: 'Login bem-sucedido' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil do utilizador autenticado' })
  @ApiResponse({ status: 200, description: 'Utilizador atual' })
  getMe(@Req() req: AuthRequest) {
    return this.auth.getMe(req.user.userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar perfil do utilizador autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil atualizado' })
  updateMe(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.userId, dto);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh-token')
  @ApiOperation({ summary: 'Renovar token de acesso' })
  @ApiResponse({ status: 200, description: 'Token renovado com sucesso' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido' })
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshToken(dto.refreshToken);
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verificar email' })
  @ApiResponse({ status: 200, description: 'Email verificado com sucesso' })
  @ApiResponse({ status: 401, description: 'Token de verificação inválido' })
  verifyEmail(@Query('token') token: string) {
    return this.auth.verifyEmail(token);
  }

  @Public()
  @HttpCode(200)
  @Post('send-password-reset-email')
  @ApiOperation({ summary: 'Enviar email de recuperação de senha' })
  @ApiResponse({ status: 200, description: 'Email enviado com sucesso' })
  @ApiResponse({ status: 404, description: 'Utilizador não encontrado' })
  sendPasswordResetEmail(@Body('email') email: string) {
    return this.auth.sendPasswordResetEmail(email);
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  @ApiOperation({ summary: 'Redefinir senha' })
  @ApiResponse({ status: 200, description: 'Senha redefinida com sucesso' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  resetPassword(@Query('token') token: string, @Body('newPassword') newPassword: string) {
    return this.auth.resetPassword(token, newPassword);
  }

  @Get('me/settings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter definições do utilizador autenticado' })
  @ApiResponse({ status: 200, description: 'Definições do utilizador' })
  getMySettings(@Req() req: AuthRequest) {
    return this.auth.getSettings(req.user.userId);
  }

  @Patch('me/settings')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar definições do utilizador autenticado' })
  @ApiResponse({ status: 200, description: 'Definições atualizadas' })
  updateMySettings(@Req() req: AuthRequest, @Body() dto: UpdateUserSettingsDto) {
    return this.auth.upsertSettings(req.user.userId, dto);
  }
}
