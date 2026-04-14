import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCollectionDto {
  @ApiProperty({ description: 'Nome da coleção', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Descrição opcional', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
