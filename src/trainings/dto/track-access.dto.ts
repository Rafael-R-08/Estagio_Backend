import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class TrackAccessDto {
  @ApiProperty({ description: 'ID Externo do curso ou gerado pelo adapter' })
  @IsString()
  externalId: string;

  @ApiProperty({ description: 'Título original do curso na plataforma' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'URL canónico do curso na plataforma externa' })
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'ID interno da plataforma (LearningPlatform)', required: false })
  @IsOptional()
  @IsString()
  platformId?: string;
}
