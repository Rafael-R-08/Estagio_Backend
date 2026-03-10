import { IsOptional, IsString, IsEnum, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum ExperienceLevel {
  JUNIOR = 'junior',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
}

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, enum: ExperienceLevel })
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  techStack?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ required: false, enum: ['escritorio', 'remoto', 'hibrido'] })
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsString()
  location?: string;

  @ApiProperty({ required: false, enum: ['PT', 'EN', 'ES', 'FR'] })
  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsString()
  preferredLanguage?: string;
}
