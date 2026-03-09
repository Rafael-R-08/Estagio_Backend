import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class EmbedTextDto {
  @ApiProperty({ example: 'introdução ao javascript', description: 'Texto a converter em embedding' })
  @IsString()
  text: string;

  @ApiPropertyOptional({ example: 'nomic-embed-text', description: 'Modelo de embedding (opcional)' })
  @IsOptional()
  @IsString()
  model?: string;
}
