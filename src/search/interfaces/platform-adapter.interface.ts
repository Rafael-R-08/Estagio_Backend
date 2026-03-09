export interface CourseResult {
  externalId: string;
  title: string;
  description: string;
  url: string;
  instructor?: string;
  rating?: number;
  durationHours?: number;
  level?: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  platformId: string;
  platformName: string;
  /** Preenchido após ranking semântico (0 a 1) */
  similarityScore?: number;
  /** Score de relevância keyword (0 a 1) */
  relevanceScore?: number;
}

export interface PlatformConfig {
  id: string;
  name: string;
  apiEndpoint?: string | null;
  config: Record<string, any>;
}

export interface IPlatformAdapter {
  readonly platformName: string;
  search(query: string, limit: number): Promise<CourseResult[]>;
}
