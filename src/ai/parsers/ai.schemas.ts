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
export const CertificateMetadataRawSchema = z.object({
  institution: z.any().optional(),
  issuer: z.any().optional(),
  provider: z.any().optional(),
  organization: z.any().optional(),

  courseName: z.any().optional(),
  course: z.any().optional(),
  certificationName: z.any().optional(),
  title: z.any().optional(),

  date: z.any().optional(),
  completionDate: z.any().optional(),
  issueDate: z.any().optional(),
  issuedDate: z.any().optional(),
  expirationDate: z.any().optional(),
  validUntil: z.any().optional(),

  durationHours: z.any().optional(),
  duration: z.any().optional(),
  durationText: z.any().optional(),

  language: z.any().optional(),
  skills: z.any().optional(),
  confidence: z.any().optional(),

  participantName: z.any().optional(),
  recipientName: z.any().optional(),

  certificateId: z.any().optional(),
  credentialId: z.any().optional(),
  credentialUrl: z.any().optional(),
  verificationUrl: z.any().optional(),
  verifyUrl: z.any().optional(),

  score: z.any().optional(),
  grade: z.any().optional(),
}).passthrough();

export const CertificateMetadataSchema = z.object({
  institution: z.string().nullable().describe('Nome da entidade emissora (ex: Udemy, IBM, Microsoft).'),
  courseName: z.string().nullable().describe('Nome exato do curso ou certificação.'),
  durationHours: z.number().nullable().describe('Carga horária se disponível no texto.'),
  date: z.string().nullable().describe('Data de conclusão (ISO 8601 ou texto).'),
  expirationDate: z.string().nullable().default(null).describe('Data de expiração se existir no certificado.'),
  participantName: z.string().nullable().default(null).describe('Nome da pessoa certificada, se identificado.'),
  credentialId: z.string().nullable().default(null).describe('ID/código da credencial, quando disponível.'),
  credentialUrl: z.string().nullable().default(null).describe('URL de validação da credencial, quando disponível.'),
  score: z.string().nullable().default(null).describe('Pontuação final caso exista no documento.'),
  grade: z.string().nullable().default(null).describe('Nota/classificação final caso exista no documento.'),
  language: z.enum(['pt', 'en']).default('pt').describe('Idioma do certificado detectado.'),
  skills: z.array(z.string()).default([]).describe('Lista de competências mencionadas no certificado.'),
  confidence: z.enum(['high', 'medium', 'low']).default('medium').describe('Nível de confiança na extração.'),
  evidence: z.record(z.string(), z.any()).default({}).describe('Metadados auxiliares para auditoria da extração.'),
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
export type CertificateMetadataRawOutput = z.infer<typeof CertificateMetadataRawSchema>;
export type CourseClassificationOutput = z.infer<typeof CourseClassificationSchema>;
