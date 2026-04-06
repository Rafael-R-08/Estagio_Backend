import { NotificationType } from '@prisma/client';
import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
