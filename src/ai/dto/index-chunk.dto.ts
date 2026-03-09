import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IndexChunkDto {
  @ApiProperty({
    description: 'Texto a ser indexado com embedding',
    example: 'NestJS com Prisma e pgvector para pesquisa semântica',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    description: 'Metadados opcionais associados ao chunk',
    example: { source: 'swagger-test', topic: 'ai' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
