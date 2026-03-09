import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RagQueryDto {
  @ApiProperty({ description: 'Pergunta ou query do utilizador' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({
    description: 'Número de chunks de contexto a usar (1-10)',
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number = 5;
}
