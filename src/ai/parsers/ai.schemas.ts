import { z } from 'zod';

/**
 * Schema para recomendações de cursos (RecommendationService)
 */
export const RecommendedCourseItemSchema = z.object({
  title: z.string().describe('Título exato de um curso da lista fornecida.'),
  category: z
    .enum(['improvement', 'interests', 'missing_skills'])
    .describe('Categoria da recomendação.'),
  reason: z
    .string()
    .describe('Justificação breve e personalizada (1-2 frases).'),
  level: z
    .string()
    .nullable()
    .optional()
    .describe('Nível de dificuldade quando disponível.'),
  estimatedHours: z
    .number()
    .nullable()
    .optional()
    .describe('Horas estimadas quando disponível.'),
});

export const RecommendationSchema = z.object({
  courses: z
    .array(RecommendedCourseItemSchema)
    .max(9)
    .describe('Lista de cursos recomendados (máx. 9, até 3 por categoria).'),
  hasContextualCourses: z
    .boolean()
    .describe('true se foram encontrados cursos relevantes no catálogo.'),
  summary: z.string().describe('Síntese personalizada em 1-2 frases.'),
});

/**
 * Schema para extração de metadados de certificados (MetadataExtractionService)
 */
export const CertificateMetadataRawSchema = z
  .object({
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
  })
  .passthrough();

export const CertificateMetadataSchema = z.object({
  institution: z
    .string()
    .nullable()
    .describe('Nome da entidade emissora (ex: Udemy, IBM, Microsoft).'),
  courseName: z
    .string()
    .nullable()
    .describe('Nome exato do curso ou certificação.'),
  durationHours: z
    .number()
    .nullable()
    .describe('Carga horária se disponível no texto.'),
  date: z
    .string()
    .nullable()
    .describe('Data de conclusão (ISO 8601 ou texto).'),
  expirationDate: z
    .string()
    .nullable()
    .default(null)
    .describe('Data de expiração se existir no certificado.'),
  participantName: z
    .string()
    .nullable()
    .default(null)
    .describe('Nome da pessoa certificada, se identificado.'),
  credentialId: z
    .string()
    .nullable()
    .default(null)
    .describe('ID/código da credencial, quando disponível.'),
  credentialUrl: z
    .string()
    .nullable()
    .default(null)
    .describe('URL de validação da credencial, quando disponível.'),
  score: z
    .string()
    .nullable()
    .default(null)
    .describe('Pontuação final caso exista no documento.'),
  grade: z
    .string()
    .nullable()
    .default(null)
    .describe('Nota/classificação final caso exista no documento.'),
  language: z
    .enum(['pt', 'en'])
    .default('pt')
    .describe('Idioma do certificado detectado.'),
  skills: z
    .array(z.string())
    .default([])
    .describe('Lista de competências mencionadas no certificado.'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .default('medium')
    .describe('Nível de confiança na extração.'),
  evidence: z
    .record(z.string(), z.any())
    .default({})
    .describe('Metadados auxiliares para auditoria da extração.'),
});

/**
 * Schema para classificação de cursos (AnalysisService)
 */
export const CourseClassificationSchema = z.object({
  type: z
    .string()
    .describe('Tipo do curso (ex: técnico, soft-skills, liderança).'),
  level: z
    .enum(['beginner', 'intermediate', 'advanced'])
    .describe('Nível de dificuldade do curso.'),
  targetProfile: z.array(z.string()).describe('Perfis ideais para este curso.'),
});

export type RecommendedCourseItem = z.infer<typeof RecommendedCourseItemSchema>;
export type RecommendationOutput = z.infer<typeof RecommendationSchema>;

/**
 * Schema para planos de orientação de cursos específicos (CoursePlanService)
 */
export const CoursePlanSchema = z.object({
  overview: z
    .string()
    .describe('Resumo do que o curso oferece e por que é relevante.'),
  prerequisites: z
    .array(z.string())
    .describe('Pré-requisitos recomendados antes de começar.'),
  learningPath: z
    .array(
      z.object({
        phase: z.string(),
        topics: z.array(z.string()),
        estimatedTime: z.string(),
      }),
    )
    .describe('Fases de aprendizagem com tópicos e tempo estimado.'),
  keyObjectives: z
    .array(z.string())
    .describe('Objetivos principais que o utilizador irá alcançar.'),
  studyTips: z
    .array(z.string())
    .describe('Dicas de estudo práticas para este curso.'),
  totalEstimatedTime: z
    .string()
    .describe('Tempo total estimado para completar o curso.'),
  afterCompletion: z
    .string()
    .describe('Próximos passos e sugestões após completar o curso.'),
});

export type CoursePlanOutput = z.infer<typeof CoursePlanSchema>;
export type CertificateMetadataOutput = z.infer<
  typeof CertificateMetadataSchema
>;
export type CertificateMetadataRawOutput = z.infer<
  typeof CertificateMetadataRawSchema
>;
export type CourseClassificationOutput = z.infer<
  typeof CourseClassificationSchema
>;
