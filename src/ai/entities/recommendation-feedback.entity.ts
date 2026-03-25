// src/ai/entities/recommendation-feedback.entity.ts
import { ApiProperty } from '@nestjs/swagger';

export class RecommendationFeedback {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  recommendationText: string;

  @ApiProperty({ required: false })
  rating?: number;

  @ApiProperty({ default: false })
  courseClicked: boolean;

  @ApiProperty({ default: false })
  courseEnrolled: boolean;

  @ApiProperty({ required: false })
  metadata?: any;

  @ApiProperty()
  createdAt: Date;
}
