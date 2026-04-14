import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class AddCourseToCollectionDto {
  @ApiProperty({ description: 'ID externo do curso na plataforma' })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({ description: 'Título do curso' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'URL do curso' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ description: 'ID da plataforma no sistema' })
  @IsString()
  @IsOptional()
  platformId?: string;
}
