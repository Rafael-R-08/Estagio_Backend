import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCollectionDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
