import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class GenerateTextDto {
  @ApiProperty({ example: 'O que é machine learning?', description: 'Prompt a enviar ao LLM' })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({ example: 'llama3', description: 'Modelo LLM (opcional)' })
  @IsOptional()
  @IsString()
  model?: string;
}
