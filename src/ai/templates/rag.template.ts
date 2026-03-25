// src/ai/templates/rag.template.ts
export function buildRagPrompt(context: string, query: string): string {
  return `És o Assistente de Carreira e Formação da Softinsa. Responde em Português de Portugal (PT-PT).

INSTRUÇÕES:
1. Prioriza o CONTEXTO abaixo para responder.
2. Se a pergunta for sobre certificações gerais, planos de carreira ou tendências TI e não estiver no contexto, usa o teu conhecimento geral para ajudar o utilizador de forma construtiva.
3. Se o utilizador perguntar sobre o seu próprio progresso, usa a secção de PERFIL (se disponível no contexto).
4. Mantém um tom profissional, encorajador e útil.

CONTEXTO:
${context}

PERGUNTA: ${query}
RESPOSTA:`.trim();
}

export interface AiSettings {
  aiResponseDetail?: string | null;     // 'concise' | 'detailed'
  aiResponseLanguage?: string | null;   // 'Português' | 'English'
  aiExplainReasoning?: boolean | null;
  aiRecommendationMode?: string | null; // 'conservative' | 'exploratory' | 'balanced'
}

export function buildRecommendationPrompt(
  userProfile: {
    techStack: string[];
    interests: string[];
    experienceLevel: string;
    learningGoals: string[];
    completedTrainings: string[];
    serviceLine?: string;
  },
  context: string,
  query: string,
  aiSettings: AiSettings = {},
): string {
  const stack = userProfile.techStack.length > 0 ? userProfile.techStack.join(', ') : 'não definida';
  const interests = userProfile.interests.length > 0 ? userProfile.interests.join(', ') : 'não definidos';
  const completed = userProfile.completedTrainings.length > 0 ? userProfile.completedTrainings.join(', ') : 'nenhuma';
  const goals = userProfile.learningGoals.length > 0 ? userProfile.learningGoals.join(', ') : 'crescimento profissional';
  const level = userProfile.experienceLevel || 'não definido';
  const serviceLine = userProfile.serviceLine || 'não definida';

  const detailInstruction =
    aiSettings.aiResponseDetail === 'detailed'
      ? 'Fornece descrições detalhadas de cada curso (2-3 frases por razão).'
      : aiSettings.aiResponseDetail === 'concise'
        ? 'Sê muito conciso. Usa no máximo 1 frase curta por razão.'
        : 'Usa 1 frase explicando porque é relevante para este perfil.';

  const reasoningInstruction = aiSettings.aiExplainReasoning
    ? '\nExplica também brevemente o teu raciocínio geral para as opções escolhidas.'
    : '';

  return `És o Consultor de Carreira Inteligente da Softinsa. Responde SEMPRE em Português de Portugal (PT-PT).${reasoningInstruction}

PERFIL DO UTILIZADOR:
- Nível: ${level}
- Tech Stack: ${stack}
- Interesses: ${interests}
- Service Line: ${serviceLine}
- Histórico: ${completed}
- Objetivos Atuais: ${goals}

CURSOS DISPONÍVEIS (CONTEXTO):
${context}

TAREFA: ${query}

REQUISITO CRÍTICO: Deves responder APENAS com um objeto JSON puro (sem markdown ou blocos de código) no seguinte formato:

{
  "interests": "Markdown formatado com 1-2 cursos baseados nos objetivos: ${goals}.",
  "improvement": "Markdown formatado com 1-2 cursos para aprofundar a stack atual: ${stack}.",
  "missing_skills": "Markdown formatado com 1-2 cursos baseados na Service Line (${serviceLine}) e gaps de perfil."
}

Cada campo deve conter Markdown formatado com:
**Nome do curso** (Plataforma)
Razão: [${detailInstruction}]

JSON:`.trim();
}
