import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UserProfileDto {
  @ApiPropertyOptional({
    description: 'Stack tecnológica do utilizador',
    example: ['Node', 'React'],
  })
  @IsOptional()
  @IsArray()
  techStack?: string[] = [];

  @ApiPropertyOptional({
    description: 'Interesses do utilizador',
    example: ['Cloud', 'DevOps'],
  })
  @IsOptional()
  @IsArray()
  interests?: string[] = [];

  @ApiPropertyOptional({
    description: 'Nível de experiência',
    example: 'intermedio',
    enum: ['junior', 'intermedio', 'senior', 'especialista', 'lider'],
  })
  @IsOptional()
  @IsString()
  experienceLevel?: string = '';
}

export class RagRecommendDto {
  @ApiProperty({
    description: 'O que o utilizador quer aprender',
    example: 'Quero aprender backend development',
  })
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

  @ApiPropertyOptional({
    description: 'Perfil do utilizador para personalizar recomendações (ignorado — perfil é carregado da BD)',
  })
  @IsOptional()
  @Type(() => UserProfileDto)
  userProfile?: UserProfileDto;
}
