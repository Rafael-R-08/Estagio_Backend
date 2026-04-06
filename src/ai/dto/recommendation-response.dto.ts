import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecommendedCourseDto {
  @ApiProperty({ example: 'AWS Cloud Practitioner Essentials' })
  title!: string;

  @ApiProperty({
    enum: ['improvement', 'interests', 'missing_skills'],
    example: 'improvement',
    description: 'Categoria da recomendação',
  })
  category!: 'improvement' | 'interests' | 'missing_skills';

  @ApiProperty({
    example: 'Alinha diretamente com a tua função de Cloud Engineer.',
  })
  reason!: string;

  @ApiPropertyOptional({ example: 'beginner' })
  level?: string;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 8 })
  estimatedHours?: number | null;
}

export class RecommendationMetadataDto {
  @ApiPropertyOptional({ example: 12 })
  sourcesCount?: number;

  @ApiPropertyOptional({ example: 24 })
  catalogueSize?: number;

  @ApiPropertyOptional({ example: 0.72 })
  maxSimilarity?: number;

  @ApiPropertyOptional({ example: 0.8 })
  profileScore?: number;

  @ApiPropertyOptional({ example: '2026-04-03T10:00:00.000Z' })
  timestamp?: string;

  @ApiPropertyOptional({ example: true })
  fromCache?: boolean;

  @ApiPropertyOptional({ example: 'Validation failed' })
  error?: string;
}

export class RecommendationResponseDto {
  @ApiProperty({ type: [RecommendedCourseDto] })
  courses!: RecommendedCourseDto[];

  @ApiProperty({
    example: true,
    description: 'true quando existem cursos do catálogo indexado',
  })
  hasContextualCourses!: boolean;

  @ApiProperty({
    example:
      'Encontrámos 7 cursos que se adequam ao teu perfil de Cloud Engineer.',
  })
  summary!: string;

  @ApiProperty({ type: RecommendationMetadataDto })
  metadata!: RecommendationMetadataDto;
}
