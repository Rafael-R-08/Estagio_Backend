import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SettingsController } from './settings.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PassportModule,
    ConfigModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          secret: config.get<string>('jwt.secret'),
          signOptions: {
            expiresIn: config.get<string>('jwt.expiresIn') as
             `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController, SettingsController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
