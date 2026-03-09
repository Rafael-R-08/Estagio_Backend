import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeCourseDto {
  @ApiProperty({ description: 'Título do curso', example: 'Introduction to Azure Cloud Services' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Descrição do curso', example: 'Learn the fundamentals of Azure...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Skills abordadas no curso', example: ['Azure', 'Cloud', 'DevOps'] })
  @IsOptional()
  @IsArray()
  skills?: string[];

  @ApiPropertyOptional({ description: 'Duração do curso', example: '8 horas' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Rating do curso (0-5)', example: 4.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Categoria do curso', example: 'Cloud Computing' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Plataforma de origem', example: 'Microsoft Learn' })
  @IsOptional()
  @IsString()
  platform?: string;
}

export class AnalyzeBatchDto {
  @ApiProperty({ description: 'Lista de cursos para analisar', type: [AnalyzeCourseDto] })
  @IsArray()
  courses: AnalyzeCourseDto[];
}
