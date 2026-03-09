import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUrl,
  IsEnum,
  IsOptional,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { TrainingStatus } from '@prisma/client';

export class CreateTrainingDto {
  @ApiProperty({ example: 'AZ-900: Microsoft Azure Fundamentals', description: 'Título do curso' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'https://learn.microsoft.com/...', description: 'URL do curso' })
  @IsUrl()
  url: string;

  @ApiProperty({ enum: TrainingStatus, example: TrainingStatus.ongoing, description: 'Estado da formação' })
  @IsEnum(TrainingStatus)
  status: TrainingStatus;

  @ApiPropertyOptional({ example: 'uuid-da-plataforma', description: 'ID da plataforma (opcional)' })
  @IsOptional()
  @IsString()
  platformId?: string;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ example: '2026-03-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ example: 8, description: 'Duração em horas' })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationHours?: number;

  @ApiPropertyOptional({ example: 'Muito bom para quem começa com Azure' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 4, description: 'Rating de 1 a 5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
