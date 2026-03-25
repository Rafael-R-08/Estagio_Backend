// src/ai/events/course-indexing.event.ts
import { ChunkSource } from '@prisma/client';

export class CourseCreatedEvent {
  constructor(
    public readonly courseId: string,
    public readonly title: string,
    public readonly description: string | null,
    public readonly provider: string,
    public readonly category?: string,
    public readonly difficulty?: string,
    public readonly source: ChunkSource = ChunkSource.EXTERNAL_COURSE,
  ) {}
}

export class CourseBatchCreatedEvent {
  constructor(
    public readonly courses: CourseCreatedEvent[]
  ) {}
}
