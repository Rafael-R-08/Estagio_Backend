export function buildRagPrompt(context: string, query: string): string {
  return `Assistente de formação da Softinsa. Responde em português de Portugal.
Usa apenas o contexto abaixo. Se não houver informação suficiente, diz isso claramente.

CONTEXTO:
${context}

PERGUNTA: ${query}
RESPOSTA:`;
}

export interface AiSettings {
  aiResponseDetail?: string | null;     // 'concise' | 'detailed'
  aiResponseLanguage?: string | null;   // override language, e.g. 'en'
  aiExplainReasoning?: boolean | null;  // include reasoning details
  aiRecommendationMode?: string | null; // 'conservative' | 'exploratory'
}

export function buildRecommendationPrompt(
  userProfile: {
    techStack: string[];
    interests: string[];
    experienceLevel: string;
    completedTrainings: string[];
  },
  context: string,
  query: string,
  aiSettings: AiSettings = {},
): string {
  const stack = userProfile.techStack.length > 0 ? userProfile.techStack.join(', ') : 'não definida';
  const interests = userProfile.interests.length > 0 ? userProfile.interests.join(', ') : 'não definidos';
  const completed = userProfile.completedTrainings.length > 0 ? userProfile.completedTrainings.join(', ') : 'nenhuma';
  const level = userProfile.experienceLevel || 'não definido';

  // Truncate context to avoid overloading small models (keep first 1200 chars)
  const trimmedContext =
    context.length > 1200 ? context.slice(0, 1200) + '...' : context;

  const lang = aiSettings.aiResponseLanguage?.toLowerCase() || 'pt';

  if (lang === 'en') {
    // ----------------------------------------------------------------------
    // PROMPT TOTALMENTE EM INGLÊS
    // ----------------------------------------------------------------------
    const detailInstruction =
      aiSettings.aiResponseDetail === 'detailed'
        ? 'Provide detailed descriptions for each course (2-3 sentences per reason).'
        : aiSettings.aiResponseDetail === 'concise'
          ? 'Be very concise. Use a maximum of 1 short sentence per reason.'
          : 'Use 1 sentence explaining why it is relevant for this profile.';

    const modeInstruction =
      aiSettings.aiRecommendationMode === 'exploratory'
        ? 'Favor courses in new or different areas from the current profile to expand horizons.'
        : aiSettings.aiRecommendationMode === 'conservative'
          ? 'Favor courses that directly fit the existing profile and tech stack.'
          : '';

    const reasoningInstruction = aiSettings.aiExplainReasoning
      ? '\nAlso briefly explain your general reasoning for the selections made.'
      : '';

    return `You are a career and course recommender. Write the actual course descriptions and reasoning in ENGLISH. However, you MUST preserve the exact structural tags in Portuguese as specified below (e.g. "Razão:").${reasoningInstruction}

USER PROFILE:
- Level: ${level}
- Current Skills/Stack: ${stack}
- Learning Interests: ${interests}
- Formations Already Completed: ${completed}

AVAILABLE COURSES:
${trimmedContext}

TASK: ${query}${modeInstruction ? `\n\nEXTRA INSTRUCTION: ${modeInstruction}` : ''}

CRITICAL REQUIREMENT: You must format your response exactly into the following 3 categories. Recommend 1 to 2 courses per category. Do not translate the category titles or the word "Razão:".

1) Recomendações por Interesses de Aprendizagem
- Based heavily on the User's "Learning Interests".
- For each course, use the format:
  **Course Name** (Platform)
  Razão: [${detailInstruction}]

2) Recomendações para Melhorar Skills Fracas/Em Falta
- Deduce what skills might be weak or missing by looking at the "Current Skills/Stack" and contrasting them with "Formations Already Completed" (what they haven't learned yet).
- For each course, use the format:
  **Course Name** (Platform)
  Razão: [${detailInstruction}]

3) Progressão Natural das Formações Realizadas
- Look at the "Formations Already Completed" and suggest the logical next steps or advanced topics.
- For each course, use the format:
  **Course Name** (Platform)
  Razão: [${detailInstruction}]

Recommendations:`;
  }

  // ----------------------------------------------------------------------
  // PROMPT TOTALMENTE EM PORTUGUÊS (Default)
  // ----------------------------------------------------------------------
  const detailInstruction =
    aiSettings.aiResponseDetail === 'detailed'
      ? 'Fornece descrições detalhadas de cada curso (2-3 frases por razão).'
      : aiSettings.aiResponseDetail === 'concise'
        ? 'Sê muito conciso. Usa no máximo 1 frase curta por razão.'
        : 'Usa 1 frase explicando porque é relevante para este perfil.';

  const modeInstruction =
    aiSettings.aiRecommendationMode === 'exploratory'
      ? 'Privilegia cursos de áreas novas ou diferentes do perfil atual para expandir horizontes.'
      : aiSettings.aiRecommendationMode === 'conservative'
        ? 'Privilegia cursos que se encaixam diretamente no perfil e stack existentes.'
        : '';

  const reasoningInstruction = aiSettings.aiExplainReasoning
    ? '\nExplica também brevemente o teu raciocínio geral para as opções escolhidas.'
    : '';

  return `És um coach de carreira e recomendador de cursos. Responde SEMPRE em português de Portugal.${reasoningInstruction}

PERFIL DO UTILIZADOR:
- Nível: ${level}
- Skills/Stack Atuais: ${stack}
- Interesses de Aprendizagem: ${interests}
- Formações Já Concluídas: ${completed}

CURSOS DISPONÍVEIS:
${trimmedContext}

TAREFA: ${query}${modeInstruction ? `\n\nINSTRUÇÃO EXTRA: ${modeInstruction}` : ''}

REQUISITO CRÍTICO: Deves formatar a tua resposta exatamente nas seguintes 3 categorias. Recomenda 1 a 2 cursos por categoria.

1) Recomendações por Interesses de Aprendizagem
- Baseado fortemente nos "Interesses de Aprendizagem" do utilizador.
- Para cada curso usa o formato:
  **Nome do curso** (Plataforma)
  Razão: [${detailInstruction}]

2) Recomendações para Melhorar Skills Fracas/Em Falta
- Deduz quais as skills que podem estar mais fracas analisando "Skills/Stack Atuais" e contrastando com "Formações Já Concluídas" (o que lhes falta treinar).
- Para cada curso usa o formato:
  **Nome do curso** (Plataforma)
  Razão: [${detailInstruction}]

3) Progressão Natural das Formações Realizadas
- Analisa as "Formações Já Concluídas" e sugere o passo lógico seguinte ou tópicos avançados.
- Para cada curso usa o formato:
  **Nome do curso** (Plataforma)
  Razão: [${detailInstruction}]

Recomendações:`;
}
