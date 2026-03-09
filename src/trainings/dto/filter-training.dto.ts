import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { TrainingStatus } from '@prisma/client';

export class FilterTrainingDto {
  @ApiPropertyOptional({ enum: TrainingStatus, description: 'Filtrar por estado' })
  @IsOptional()
  @IsEnum(TrainingStatus)
  status?: TrainingStatus;

  @ApiPropertyOptional({ example: 'uuid-da-plataforma', description: 'Filtrar por plataforma' })
  @IsOptional()
  @IsString()
  platformId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Data de início (a partir de)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Data de fim (até)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
