import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
