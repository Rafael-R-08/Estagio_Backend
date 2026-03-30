import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ description: 'Termo de pesquisa', example: 'Azure DevOps' })
  @IsString()
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

  @ApiProperty({ description: 'Relevância mínima suportada (0 a 5)', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRelevance?: number;
}
