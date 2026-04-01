import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class AddDocumentDto {
  @Transform(({ obj, value }) => value || obj.url || obj.link || obj.path || obj.fileUrl)
  @ApiPropertyOptional({ example: 'https://example.com/notes.pdf' })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @Transform(({ obj, value }) => value || obj.name || obj.title || obj.fileName)
  @ApiPropertyOptional({ example: 'Notas de Aula.pdf' })
  @IsOptional()
  @IsString()
  fileName?: string;
}
