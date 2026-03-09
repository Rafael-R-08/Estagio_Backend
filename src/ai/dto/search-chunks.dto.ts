import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchChunksDto {
  @ApiProperty({
    description: 'Texto de pesquisa para encontrar chunks similares',
    example: 'prisma vector database',
  })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({
    description: 'Número máximo de resultados a retornar',
    example: 5,
    minimum: 1,
    maximum: 100,
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 5;
}
