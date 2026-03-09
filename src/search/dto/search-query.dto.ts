import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
