import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateResourceDto {
  @Transform(({ obj, value }) => value || obj.name || obj.label)
  @ApiProperty({ example: 'Link de Documentação', description: 'Título do cartão' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Conteúdo detalhado ou descrição do recurso', description: 'Conteúdo de texto' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 0, description: 'Posição no quadro' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position?: number;
}
