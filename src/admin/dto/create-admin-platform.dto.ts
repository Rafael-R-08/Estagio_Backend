import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsJSON, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdminPlatformDto {
  @ApiProperty({ description: 'Nome único da plataforma' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ description: 'Tipo: udemy | coursera | linkedin | custom | ...' })
  @IsString()
  type: string;

  @ApiProperty({ required: false, description: 'URL base da API' })
  @IsOptional()
  @IsString()
  apiEndpoint?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  apiKeyRequired?: boolean;

  @ApiProperty({ required: false, description: 'Chave de API (encriptada no armazenamento)' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  searchEnabled?: boolean;

  @ApiProperty({
    required: false,
    description: 'Configuração extra em JSON (ex: headers, rate limits)',
  })
  @IsOptional()
  @IsJSON()
  config?: string;
}
