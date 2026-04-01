import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsArray, IsOptional, ValidateNested, IsInt, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ServiceLine, ExperienceLevel, SkillLevel } from '@prisma/client';

class SkillDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  skillName: string;

  @Transform(({ value }) => {
    const map: Record<string, SkillLevel> = {
      beginner: SkillLevel.iniciante,
      iniciante: SkillLevel.iniciante,
      intermediate: SkillLevel.intermedio,
      intermedio: SkillLevel.intermedio,
      advanced: SkillLevel.experiente,
      experiente: SkillLevel.experiente,
      expert: SkillLevel.experiente,
    };
    return map[value?.toLowerCase()] || value;
  })
  @ApiProperty({ enum: SkillLevel })
  @IsNotEmpty()
  @IsEnum(SkillLevel)
  level: SkillLevel;
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
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.filter(s => s && s.skillName && s.skillName.trim() !== "");
  })
  skills: SkillDto[];
}
