import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CoursePlanRequestDto {
  @ApiProperty({ example: 'uuid-training', description: 'ID do TrainingRecord para o qual gerar o plano' })
  @IsUUID('4')
  trainingId: string;

  @ApiPropertyOptional({ example: 'Quero focar-me na parte prática', description: 'Foco específico opcional do utilizador' })
  @IsOptional()
  @IsString()
  focus?: string;
}

export interface CoursePlanPhase {
  phase: string;
  topics: string[];
  estimatedTime: string;
}

export interface CoursePlanResponse {
  trainingId: string;
  courseTitle: string;
  overview: string;
  prerequisites: string[];
  learningPath: CoursePlanPhase[];
  keyObjectives: string[];
  studyTips: string[];
  totalEstimatedTime: string;
  afterCompletion: string;
}
