import { z } from 'zod';

/**
 * Schema para recomendações de cursos (RecommendationService)
 */
export const RecommendationSchema = z.object({
  improvement: z.string().describe('Sugestões de melhoria profissional com base no perfil.'),
  interests: z.string().describe('Sugestões com base nos interesses declarados.'),
  missing_skills: z.string().describe('Sugestões para colmatar falhas de competências identificadas.'),
});

/**
 * Schema para extração de metadados de certificados (MetadataExtractionService)
 */
export const CertificateMetadataSchema = z.object({
  institution: z.string().nullable().describe('Nome da entidade emissora (ex: Udemy, IBM, Microsoft).'),
  courseName: z.string().nullable().describe('Nome exato do curso ou certificação.'),
  durationHours: z.number().nullable().describe('Carga horária se disponível no texto.'),
  date: z.string().nullable().describe('Data de conclusão (ISO 8601 ou texto).'),
  language: z.enum(['pt', 'en']).default('pt').describe('Idioma do certificado detectado.'),
  skills: z.array(z.string()).default([]).describe('Lista de competências mencionadas no certificado.'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Nível de confiança na extração.'),
});

/**
 * Schema para classificação de cursos (AnalysisService)
 */
export const CourseClassificationSchema = z.object({
  type: z.string().describe('Tipo do curso (ex: técnico, soft-skills, liderança).'),
  level: z.enum(['beginner', 'intermediate', 'advanced']).describe('Nível de dificuldade do curso.'),
  targetProfile: z.array(z.string()).describe('Perfis ideais para este curso.'),
});

export type RecommendationOutput = z.infer<typeof RecommendationSchema>;
export type CertificateMetadataOutput = z.infer<typeof CertificateMetadataSchema>;
export type CourseClassificationOutput = z.infer<typeof CourseClassificationSchema>;
