// src/ai/entities/text-chunk.entity.ts
import { ApiProperty } from '@nestjs/swagger';
import { ChunkSource } from '@prisma/client';

export class TextChunk {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: ChunkSource })
  source: ChunkSource;

  @ApiProperty({ required: false })
  sourceId?: string;

  @ApiProperty({ required: false })
  metadata?: any;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  lastUpdatedAt?: Date;
}
