import { IsUrl, IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScrapeDto {
  @ApiProperty({
    example: 'https://example.com',
    description: 'URL da página a scrapar',
  })
  @IsUrl({}, { message: 'URL inválida' })
  url: string;

  @ApiPropertyOptional({
    example: 'h1, .title, #content',
    description: 'Seletores CSS separados por vírgula',
  })
  @IsOptional()
  @IsString()
  selectors?: string;

  @ApiPropertyOptional({
    example: ['title', 'meta[name="description"]'],
    description: 'Array de seletores específicos',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  elements?: string[];
}
