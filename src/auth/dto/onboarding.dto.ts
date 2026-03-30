import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsArray, IsOptional, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceLine, ExperienceLevel } from '@prisma/client';

class SkillDto {
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
  level: string; // 'beginner', 'intermediate', 'advanced'
}

export class OnboardingDto {
  @ApiProperty({ enum: ServiceLine })
  @IsNotEmpty()
  @IsEnum(ServiceLine)
  serviceLine: ServiceLine;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  userFunction: string;

  @ApiProperty({ enum: ExperienceLevel })
  @IsNotEmpty()
  @IsEnum(ExperienceLevel)
  experienceLevel: ExperienceLevel;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  interests: string[];

  @ApiProperty({ type: [SkillDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillDto)
  skills: SkillDto[];
}
