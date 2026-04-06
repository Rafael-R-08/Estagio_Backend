// src/ai/events/course-indexing.event.ts
import { ChunkSource } from '@prisma/client';

export class CourseCreatedEvent {
  constructor(
    public readonly externalId: string,
    public readonly platformId: string,
    public readonly title: string,
    public readonly description: string | null,
    public readonly provider: string,
    public readonly category?: string,
    public readonly difficulty?: string,
    public readonly source: ChunkSource = ChunkSource.EXTERNAL_COURSE,
    public readonly durationHours?: number,
    public readonly language?: string,
    public readonly isFree?: boolean,
    public readonly rating?: number,
  ) {}
}

export class CourseBatchCreatedEvent {
  constructor(public readonly courses: CourseCreatedEvent[]) {}
}
