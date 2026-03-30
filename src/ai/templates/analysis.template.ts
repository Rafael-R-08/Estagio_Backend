/**
 * src/ai/templates/analysis.template.ts
 * Templates compactados para Llama 3.3 (Audit Production).
 */

export interface CourseInput {
  title: string;
  description?: string;
  skills?: string[];
  duration?: string;
  rating?: number;
  category?: string;
  platform?: string;
}

export function buildSummaryPrompt(course: CourseInput, lang: string = 'pt'): string {
  const isEn = lang.toLowerCase() === 'en';
  return `Role: Softinsa Training Expert. Task: Generate 3-sentence MAX summary.
Language: ${isEn ? 'English' : 'Portuguese (Portugal)'}. Focus on practical benefit.

Course: ${course.title}
Platform: ${course.platform || 'not specified'}
Description: ${course.description || 'not available'}

Summary:`.trim();
}

export function buildTopicsPrompt(course: CourseInput, lang: string = 'pt'): string {
  const isEn = lang.toLowerCase() === 'en';
  return `Task: Extract 5 main topics. Language: ${isEn ? 'English' : 'Portuguese (Portugal)'}.
Respond ONLY with a JSON array of strings. 
Example: ["T1","T2","T3"]

Course: ${course.title}
Desc: ${course.description || 'n/a'}

Topics:`.trim();
}

export function buildClassificationPrompt(course: CourseInput, lang: string = 'pt'): string {
  const isEn = lang.toLowerCase() === 'en';
  return `Task: Classify course in JSON. Fields: type, level, targetProfile(array).
Types: technical, softskills, cloud, security, data, devops, management, other.
Levels: beginner, intermediate, advanced.
Profiles: junior, mid, senior, lead.

Course: ${course.title}
Classification:`.trim();
}

export function buildSimplifyPrompt(course: CourseInput, lang: string = 'pt'): string {
  const isEn = lang.toLowerCase() === 'en';
  return `Task: Simplify description for accessibility. MAX 2 sentences. 
Language: ${isEn ? 'English' : 'Portuguese (Portugal)'}. Focus on benefit.

Course: ${course.title}
Original: ${course.description || 'n/a'}

Simplified:`.trim();
}
