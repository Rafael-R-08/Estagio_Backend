import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator';

export class UpdateAdminPlatformDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false, description: 'URL base da API' })
  @IsOptional()
  @IsString()
  apiEndpoint?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  apiKeyRequired?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isSearchEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ required: false, description: 'Configuração extra em JSON' })
  @IsOptional()
  @IsJSON()
  config?: string;
}
