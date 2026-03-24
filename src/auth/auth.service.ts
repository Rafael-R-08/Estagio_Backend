// src/auth/auth.service.ts
import { 
  Injectable, 
  ConflictException, 
  UnauthorizedException, 
  NotFoundException 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private configService: ConfigService,
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
        techStack: user.techStack,
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
        techStack: true,
        interests: true,
        jobTitle: true,
        department: true,
        location: true,
        preferredLanguage: true,
        serviceLine: true,
        onboardingDone: true,
        managedLineId: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async onboarding(userId: string, serviceLine: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        serviceLine: serviceLine as any,
        onboardingDone: true,
      },
    });
    return this.getMe(userId);
  }

  async updateProfile(
    userId: string,
    dto: { name?: string; experienceLevel?: string; techStack?: string[]; interests?: string[]; jobTitle?: string; department?: string; location?: string; preferredLanguage?: string; serviceLine?: string },
  ) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.experienceLevel !== undefined) data.experienceLevel = dto.experienceLevel;
    if (dto.techStack !== undefined) data.techStack = dto.techStack;
    if (dto.interests !== undefined) data.interests = dto.interests;
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle;
    if (dto.department !== undefined) data.department = dto.department;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.preferredLanguage !== undefined) data.preferredLanguage = dto.preferredLanguage;
    if (dto.serviceLine !== undefined) data.serviceLine = dto.serviceLine;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        experienceLevel: true,
        techStack: true,
        interests: true,
        jobTitle: true,
        department: true,
        location: true,
        preferredLanguage: true,
        serviceLine: true,
        onboardingDone: true,
        managedLineId: true,
      },
    });
    return user;
  }

  async getSettings(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (settings) return settings;
    return {
      userId,
      aiResponseDetail: null,
      aiResponseLanguage: null,
      aiExplainReasoning: false,
      aiRecommendationMode: null,
      notifyWeeklyRecs: true,
      notifyCertExpiry: true,
      notifyProgress: true,
      notifyByEmail: true,
      notifyInApp: true,
      adminCanSeeRecs: true,
      aiCanUseHistory: true,
      uiLanguage: 'pt',
    };
  }

  async upsertSettings(userId: string, dto: UpdateUserSettingsDto) {
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

    const accessToken = await this.jwt.signAsync(payload, {
      secret,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: '7d',
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: sub,
        token: refreshToken,
        expiresAt,
      },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(refreshToken: string) {
    try {
      const refreshSecret = this.configService.get<string>('jwt.refreshTokenSecret') || 'dev-refresh-secret';
      
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });

      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.prisma.user.findUnique({ 
        where: { id: payload.sub } 
      });
      if (!user) throw new UnauthorizedException('Invalid refresh token');

      return this.generateTokens(user.id, user.email, user.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async sendVerificationEmail(userId: string, email: string) {
    const token = await this.jwt.signAsync(
      { userId }, 
      {
        secret: this.configService.get<string>('jwt.verificationTokenSecret') || 'dev-verification-secret',
        expiresIn: '24h',
      }
    );

    console.log(`Verification email token for ${email}: ${token}`);
  }

  async verifyEmail(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.verificationTokenSecret') || 'dev-verification-secret',
      });

      await this.prisma.user.update({
        where: { id: payload.userId },
        data: { emailVerified: true },
      });

      return { message: 'Email verificado com sucesso' };
    } catch {
      throw new UnauthorizedException('Invalid verification token');
    }
  }

  async sendPasswordResetEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const token = await this.jwt.signAsync(
      { userId: user.id }, 
      {
        secret: this.configService.get<string>('jwt.passwordResetTokenSecret') || 'dev-reset-secret',
        expiresIn: '1h',
      }
    );

    console.log(`Password reset token for ${email}: ${token}`);
    
    return { message: 'Email de recuperação enviado com sucesso' };
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.passwordResetTokenSecret') || 'dev-reset-secret',
      });

      const user = await this.prisma.user.findUnique({ 
        where: { id: payload.userId } 
      });
      if (!user) throw new NotFoundException('Usuário não encontrado');

      const passwordHash = await bcrypt.hash(newPassword, 10);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      return { message: 'Senha redefinida com sucesso' };
    } catch {
      throw new UnauthorizedException('Invalid password reset token');
    }
  }
}
