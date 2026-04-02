import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsBoolean, IsNumber, IsOptional, IsString, Max, Min, IsEnum, Length, IsNotEmpty } from 'class-validator';
import { CourseLevel } from '@prisma/client';

export class SearchQueryDto {
  @ApiProperty({ description: 'Termo de pesquisa', example: 'Azure DevOps' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  q: string;

  @ApiProperty({
    description: 'Número máximo de resultados por plataforma',
    default: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiProperty({
    description: 'Número da página (paginação)',
    default: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description:
      'Filtrar por nome(s) de plataforma. Ex: "Microsoft Learn" ou ["Microsoft Learn","Academia Portugal Digital"]',
    example: 'Microsoft Learn',
    isArray: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @ApiProperty({ description: 'Apenas cursos gratuitos ou pagos (opcional)', required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  isFree?: boolean;

  @ApiProperty({ description: 'Classificação mínima suportada (0 a 5)', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiProperty({ description: 'Relevância mínima Softinsa (0 a 1)', required: false, example: 0.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minRelevance?: number;

  @ApiProperty({ description: 'Classificação interna mínima (Softinsa)', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minInternalRating?: number;

  @ApiProperty({ description: 'Nível de dificuldade do curso', enum: CourseLevel, required: false })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiProperty({ description: 'Filtrar por idioma (ex: pt, en)', example: 'pt', required: false })
  @IsOptional()
  @IsString()
  language?: string;
}
