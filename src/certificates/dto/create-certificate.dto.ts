import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsInt, Min } from 'class-validator';

export class CreateCertificateDto {
  @ApiProperty({ example: 'uuid-do-training', description: 'ID do registo de formação associado' })
  @IsString()
  trainingId: string;

  @ApiPropertyOptional({ example: 'AZ-900: Microsoft Azure Fundamentals' })
  @IsOptional()
  @IsString()
  courseName?: string;

  @ApiPropertyOptional({ example: 'Microsoft' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  completionDate?: string;

  @ApiPropertyOptional({ example: '2028-03-01T00:00:00.000Z', description: 'Data de expiração (se aplicável)' })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationHours?: number;
}
