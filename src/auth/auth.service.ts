// src/auth/auth.service.ts
import { 
  Injectable, 
  ConflictException, 
  UnauthorizedException, 
  Logger
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Role, NotificationType } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { EmailService } from '../notifications/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildWelcomeEmail,
} from '../notifications/templates/email-templates';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ 
      where: { email: dto.email } 
    });
    if (exists) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: { 
        email: dto.email, 
        passwordHash, 
        name: dto.name, 
        role: Role.USER 
      },
      select: { id: true, email: true, name: true, role: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Fire-and-forget: welcome email + in-app notification
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const { subject, html, text } = buildWelcomeEmail(user.name ?? '', `${frontendUrl}/login`);
    this.emailService.sendMail({ to: user.email, subject, html, text }).catch((err) =>
      this.logger.warn(`Falha ao enviar email de boas-vindas para ${user.email}: ${err.message}`),
    );
    this.notificationsService.create({
      userId: user.id,
      type: NotificationType.WELCOME,
      title: 'Bem-vindo ao LearningHub!',
      body: 'A sua conta foi criada com sucesso. Complete o seu perfil para obter recomendações personalizadas.',
    }).catch(() => { /* non-critical */ });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ 
      where: { email: dto.email } 
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const { access_token, refresh_token } = tokens;
    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        experienceLevel: user.experienceLevel,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        experienceLevel: true,
        interests: true,
        serviceLine: true,
        onboardingDone: true,
        managedLineId: true,
        userFunction: true,
        createdAt: true,
        skills: { select: { skillName: true, level: true } },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async onboarding(userId: string, dto: OnboardingDto) {
    const { skills, ...userData } = dto;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...userData,
          onboardingDone: true,
        },
      });

      await tx.userSkill.deleteMany({
        where: { userId },
      });

      if (skills && skills.length > 0) {
        await tx.userSkill.createMany({
          data: skills.map((s) => ({
            userId,
            skillName: s.skillName,
            level: s.level,
          })),
        });
      }
    });

    return this.getMe(userId);
  }

  async updateProfile(
    userId: string,
    dto: {
      name?: string;
      experienceLevel?: any;
      interests?: string[];
      serviceLine?: any;
      userFunction?: string;
      skills?: { skillName: string; level: any }[];
    },
  ) {
    const { skills, ...userData } = dto;

    const profileSelect = {
      id: true,
      email: true,
      name: true,
      role: true,
      experienceLevel: true,
      interests: true,
      serviceLine: true,
      onboardingDone: true,
      managedLineId: true,
      userFunction: true,
      createdAt: true,
      skills: { select: { skillName: true, level: true } },
    } as const;

    let user: any;

    if (skills !== undefined) {
      user = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: userData });
        await tx.userSkill.deleteMany({ where: { userId } });
        if (skills.length > 0) {
          await tx.userSkill.createMany({
            data: skills.map((s) => ({ userId, skillName: s.skillName, level: s.level })),
          });
        }
        return tx.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect });
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: userData,
        select: profileSelect,
      });
    }

    try {
      await this.cacheService.invalidatePattern(`ai:*${userId}*`);
    } catch (_) { /* cache invalidation is non-critical */ }

    return user;
  }

  async getSettings(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (settings) return settings;
    
    // Create Default settings
    return this.prisma.userSettings.create({
      data: {
        userId,
        notifyWeeklyRecs: true,
        notifyCertExpiry: true,
        notifyProgress: true,
        notifyByEmail: true,
        notifyInApp: true,
        uiLanguage: 'pt',
      }
    });
  }

  async upsertSettings(userId: string, dto: UpdateSettingsDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  private parseDurationMs(duration: string): number {
    const units: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    const match = /^(\d+)(ms|s|m|h|d|w)$/.exec(duration);
    if (!match) return 7 * 86_400_000;
    return parseInt(match[1], 10) * (units[match[2]] ?? 0);
  }

  private async generateTokens(sub: string, email: string, role: Role) {
    const payload = { sub, email, role };
    const secret = this.configService.get<string>('jwt.secret') || 'dev-secret';
    const refreshSecret = this.configService.get<string>('jwt.refreshTokenSecret') || 'dev-refresh-secret';
    const accessExpiresIn = this.configService.get<string>('jwt.accessTokenExpiresIn') || '15m';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshTokenExpiresIn') || '7d';

    const accessToken = await this.jwt.signAsync(payload, { secret, expiresIn: accessExpiresIn as any });
    const refreshToken = await this.jwt.signAsync(payload, { secret: refreshSecret, expiresIn: refreshExpiresIn as any });

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.parseDurationMs(refreshExpiresIn));
    await this.prisma.refreshToken.create({
      data: { userId: sub, token: tokenHash, expiresAt },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(refreshToken: string) {
    try {
      const refreshSecret = this.configService.get<string>('jwt.refreshTokenSecret') || 'dev-refresh-secret';
      const payload = await this.jwt.verifyAsync(refreshToken, { secret: refreshSecret });
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const storedToken = await this.prisma.refreshToken.findUnique({ where: { token: tokenHash } });
      if (!storedToken || storedToken.expiresAt < new Date()) throw new UnauthorizedException('Invalid refresh token');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('Invalid refresh token');
      
      // Revoke old token
      await this.prisma.refreshToken.delete({ where: { token: tokenHash } });
      
      return this.generateTokens(user.id, user.email, user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredTokens() {
    try {
      const { count } = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        Logger.log(`[Cron] Cleaned up ${count} expired refresh tokens.`, 'AuthService');
      }
    } catch (error) {
      Logger.error('[Cron] Failed to clean up expired refresh tokens:', error, 'AuthService');
    }
  }
}
