import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUrl, IsArray, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CourseLevel } from '@prisma/client';

export class CreateSoftinsaLearningDto {
  @ApiProperty({ example: 'Introdução ao SharePoint Online' })
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: 'https://intranet.softinsa.com/learning/sharepoint' })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiProperty({ required: false, example: 'IT' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiProperty({ required: false, type: [String], example: ['SharePoint', 'Microsoft 365', 'Colaboração'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiProperty({ required: false, enum: CourseLevel })
  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @ApiProperty({ required: false, example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationHours?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  hasCertificate?: boolean;
}
