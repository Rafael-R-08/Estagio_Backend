export function buildRagPrompt(context: string, query: string): string {
  return `Assistente de formação da Softinsa. Responde em português de Portugal.
Usa apenas o contexto abaixo. Se não houver informação suficiente, diz isso claramente.

CONTEXTO:
${context}

PERGUNTA: ${query}
RESPOSTA:`;
}

export function buildRecommendationPrompt(
  userProfile: {
    techStack: string[];
    interests: string[];
    experienceLevel: string;
  },
  context: string,
  query: string,
): string {
  const stack = userProfile.techStack.join(', ') || 'não definida';
  const interests = userProfile.interests.join(', ') || 'não definidos';
  const level = userProfile.experienceLevel || 'não definido';

  // Truncate context to avoid overloading small models (keep first 1200 chars)
  const trimmedContext =
    context.length > 1200 ? context.slice(0, 1200) + '...' : context;

  return `És um recomendador de cursos. Responde SEMPRE em português de Portugal.

PERFIL DO UTILIZADOR:
- Nível: ${level}
- Stack: ${stack}
- Interesses: ${interests}

CURSOS DISPONÍVEIS:
${trimmedContext}

TAREFA: ${query}

Recomenda exatamente 3 cursos. Para cada um usa este formato:
1. **Nome do curso** (Plataforma)
   Razão: [1 frase explicando porque é relevante para este perfil]

Recomendações:`;
}
