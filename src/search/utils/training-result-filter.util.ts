import { CourseResult } from '../interfaces/platform-adapter.interface';

const POSITIVE_KEYWORDS = [
  'course',
  'courses',
  'training',
  'formacao',
  'formação',
  'certification',
  'module',
  'learning path',
  'bootcamp',
  'workshop',
];

const NEGATIVE_KEYWORDS = [
  'documentation',
  'docs',
  'reference',
  'api reference',
  'release notes',
  'changelog',
  'faq',
  'forum',
  'community',
  'comment',
  'comments',
  'sample code',
];

export function isLikelyTrainingResult(result: CourseResult): boolean {
  const platform = (result.platformName || '').toLowerCase();
  const url = (result.url || '').toLowerCase();
  const text = `${result.title || ''} ${result.description || ''} ${(result.tags || []).join(' ')}`.toLowerCase();

  // Platform-specific hard rules first (most reliable)
  if (platform.includes('microsoft learn')) {
    return url.includes('/training/') || url.includes('/credentials/') || url.includes('/applied-skills/');
  }

  if (platform.includes('trailhead')) {
    return url.includes('/content/learn/');
  }

  if (platform.includes('udemy')) {
    return url.includes('/course/');
  }

  if (platform.includes('academia portugal digital')) {
    return url.includes('/cursos') || url.includes('/formacao') || url.includes('/formação');
  }

  if (platform.includes('ibm skillsbuild')) {
    return (
      url.includes('/learn/') ||
      url.includes('/courses/') ||
      url.includes('/course/') ||
      url.includes('/digital-credentials/')
    );
  }

  // Generic fallback for unknown platforms
  const hasPositive = POSITIVE_KEYWORDS.some((k) => text.includes(k) || url.includes(k.replace(' ', '-')));
  const hasNegative = NEGATIVE_KEYWORDS.some((k) => text.includes(k) || url.includes(k.replace(' ', '-')));

  return hasPositive && !hasNegative;
}
