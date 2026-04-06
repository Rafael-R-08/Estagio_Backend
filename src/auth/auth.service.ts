// src/auth/auth.service.ts
import { 
  Injectable, 
  ConflictException, 
  UnauthorizedException, 
  NotFoundException,
  Logger
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { Role } from '@prisma/client';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private configService: ConfigService,
    private readonly cacheService: CacheService,
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

  async upsertSettings(userId: string, dto: any) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
    });
  }

  private async generateTokens(sub: string, email: string, role: Role) {
    const payload = { sub, email, role };
    const secret = this.configService.get<string>('jwt.secret') || 'dev-secret';
    const refreshSecret = this.configService.get<string>('jwt.refreshTokenSecret') || 'dev-refresh-secret';

    const accessToken = await this.jwt.signAsync(payload, { secret, expiresIn: '15m' });
    const refreshToken = await this.jwt.signAsync(payload, { secret: refreshSecret, expiresIn: '7d' });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId: sub, token: refreshToken, expiresAt },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(refreshToken: string) {
    try {
      const refreshSecret = this.configService.get<string>('jwt.refreshTokenSecret') || 'dev-refresh-secret';
      const payload = await this.jwt.verifyAsync(refreshToken, { secret: refreshSecret });
      const storedToken = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
      if (!storedToken || storedToken.expiresAt < new Date()) throw new UnauthorizedException('Invalid refresh token');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('Invalid refresh token');
      
      // Revoke old token
      await this.prisma.refreshToken.delete({ where: { token: refreshToken } });
      
      return this.generateTokens(user.id, user.email, user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async sendVerificationEmail(userId: string, email: string) {
    const token = await this.jwt.signAsync({ userId }, {
      secret: this.configService.get<string>('jwt.verificationTokenSecret') || 'dev-verification-secret',
      expiresIn: '24h',
    });
    console.log(`Verification email token for ${email}: ${token}`);
  }

  async verifyEmail(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.verificationTokenSecret') || 'dev-verification-secret',
      });
      await this.prisma.user.update({ where: { id: payload.userId }, data: { emailVerified: true } });
      return { message: 'Email verificado com sucesso' };
    } catch {
      throw new UnauthorizedException('Invalid verification token');
    }
  }

  async sendPasswordResetEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const token = await this.jwt.signAsync({ userId: user.id }, {
      secret: this.configService.get<string>('jwt.passwordResetTokenSecret') || 'dev-reset-secret',
      expiresIn: '1h',
    });
    console.log(`Password reset token for ${email}: ${token}`);
    return { message: 'Email de recuperação enviado com sucesso' };
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.passwordResetTokenSecret') || 'dev-reset-secret',
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) throw new NotFoundException('Usuário não encontrado');
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      return { message: 'Senha redefinida com sucesso' };
    } catch {
      throw new UnauthorizedException('Invalid password reset token');
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
