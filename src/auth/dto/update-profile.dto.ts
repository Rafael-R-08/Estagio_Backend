import { IsOptional, IsString, IsEnum, IsArray, ValidateNested, IsInt, Min, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ServiceLine, ExperienceLevel, SkillLevel } from '@prisma/client';

class SkillUpdateDto {
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
