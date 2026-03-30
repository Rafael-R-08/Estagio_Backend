import { IsOptional, IsString, IsEnum, IsArray, ValidateNested, IsInt, Min, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ServiceLine, ExperienceLevel } from '@prisma/client';

class SkillUpdateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  skillName: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  yearsOfExperience: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  level: string;
}

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, enum: ExperienceLevel })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userFunction?: string;

  @ApiProperty({ required: false, enum: ServiceLine })
  @IsOptional()
  @IsEnum(ServiceLine)
  serviceLine?: ServiceLine;

  @ApiProperty({ required: false, type: [SkillUpdateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillUpdateDto)
  skills?: SkillUpdateDto[];
}
