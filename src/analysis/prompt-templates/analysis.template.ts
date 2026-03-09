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
Categoria: ${course.category || 'não especificada'}
Duração: ${course.duration || 'não especificada'}
Rating: ${course.rating ?? 'não disponível'}
Descrição: ${course.description || 'não disponível'}
Skills: ${course.skills?.join(', ') || 'não especificadas'}

Resumo:`;
}

export function buildTopicsPrompt(course: CourseInput): string {
  return `Analisa o seguinte curso e extrai os 5 tópicos principais que serão abordados.
Retorna APENAS uma lista JSON de strings, sem texto adicional. Exemplo: ["Tópico 1","Tópico 2","Tópico 3"]

Curso: ${course.title}
Descrição: ${course.description || 'não disponível'}
Skills: ${course.skills?.join(', ') || 'não especificadas'}

Tópicos (JSON array):`;
}

export function buildClassificationPrompt(course: CourseInput): string {
  return `Classifica o seguinte curso de acordo com as categorias disponíveis.
Responde APENAS com um objeto JSON com os campos: type, level, targetProfile. Sem texto adicional.

Tipos possíveis: "technical", "softskills", "cloud", "security", "data", "devops", "management", "other"
Níveis possíveis: "beginner", "intermediate", "advanced"
Perfis alvo possíveis (array): "junior", "mid", "senior", "lead"

Exemplo de resposta:
{"type":"cloud","level":"intermediate","targetProfile":["mid","senior"]}

Curso: ${course.title}
Categoria: ${course.category || 'não especificada'}
Descrição: ${course.description || 'não disponível'}
Skills: ${course.skills?.join(', ') || 'não especificadas'}

Classificação (JSON):`;
}

export function buildSimplifyPrompt(course: CourseInput): string {
  return `Simplifica a descrição do seguinte curso para linguagem simples e acessível em português de Portugal.
Máximo 2 frases. Evita jargão técnico excessivo. Foca no benefício prático para o colaborador.

Curso: ${course.title}
Descrição original: ${course.description || 'não disponível'}

Descrição simplificada:`;
}
