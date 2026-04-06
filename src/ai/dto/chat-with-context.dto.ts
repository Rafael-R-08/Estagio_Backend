import { IsString, IsOptional, IsArray, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatWithContextDto {
  @ApiProperty({ example: 'Podes dar-me dicas sobre este curso?', description: 'Mensagem do utilizador' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  prompt: string;

  @ApiPropertyOptional({ example: 'uuid-conversa', description: 'ID da conversa existente' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({
    example: ['uuid-training-1', 'uuid-training-2'],
    description: 'IDs dos TrainingRecords mencionados via @ no chat',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedTrainingIds?: string[];
}
