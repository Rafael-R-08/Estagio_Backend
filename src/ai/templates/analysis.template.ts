// src/ai/templates/analysis.template.ts
export interface CourseInput {
  title: string;
  description?: string;
  skills?: string[];
  duration?: string;
  rating?: number;
  category?: string;
  platform?: string;
}

export function buildSummaryPrompt(course: CourseInput): string {
  return `És um especialista em formação profissional da Softinsa.
Analisa o seguinte curso e gera um resumo curto (máximo 3 frases) em português de Portugal.
O resumo deve ser claro, direto e útil para um colaborador decidir se quer fazer o curso.

Curso: ${course.title}
Plataforma: ${course.platform || 'não especificada'}
Descrição: ${course.description || 'não disponível'}

Resumo:`.trim();
}

export function buildTopicsPrompt(course: CourseInput): string {
  return `Analisa o seguinte curso e extrai os 5 tópicos principais que serão abordados.
Retorna APENAS uma lista JSON de strings, sem texto adicional. Exemplo: ["Tópico 1","Tópico 2","Tópico 3"]

Curso: ${course.title}
Descrição: ${course.description || 'não disponível'}

Tópicos (JSON array):`.trim();
}

export function buildClassificationPrompt(course: CourseInput): string {
  return `Classifica o seguinte curso de acordo com as categorias disponíveis em formato JSON.
Campos: type, level, targetProfile.

Tipos: "technical", "softskills", "cloud", "security", "data", "devops", "management", "other"
Níveis: "beginner", "intermediate", "advanced"
Perfís: "junior", "mid", "senior", "lead" (array)

Curso: ${course.title}
Descrição: ${course.description || 'não disponível'}

Classificação (JSON):`.trim();
}

export function buildSimplifyPrompt(course: CourseInput): string {
  return `Simplifica a descrição do seguinte curso para linguagem acessível em PT-PT.
Máximo 2 frases. Foca no benefício prático.

Curso: ${course.title}
Descrição original: ${course.description || 'não disponível'}

Descrição simplificada:`.trim();
}
