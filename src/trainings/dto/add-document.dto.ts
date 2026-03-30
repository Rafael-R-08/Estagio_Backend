import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class AddDocumentDto {
  @ApiProperty({ example: 'https://example.com/notes.pdf' })
  @IsNotEmpty()
  @IsUrl()
  fileUrl: string;

  @ApiProperty({ example: 'Notas de Aula.pdf' })
  @IsNotEmpty()
  @IsString()
  fileName: string;
}
