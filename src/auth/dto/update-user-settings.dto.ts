import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserSettingsDto {
  // Preferências da IA
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  aiResponseDetail?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  aiResponseLanguage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  aiExplainReasoning?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  aiRecommendationMode?: string;

  // Notificações
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyWeeklyRecs?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyCertExpiry?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyProgress?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyByEmail?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notifyInApp?: boolean;

  // Interface
  @ApiProperty({ required: false, enum: ['pt', 'en'], description: 'Idioma da interface' })
  @IsOptional()
  @IsString()
  @IsIn(['pt', 'en'])
  uiLanguage?: string;

  // Privacidade
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  adminCanSeeRecs?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  aiCanUseHistory?: boolean;
}
