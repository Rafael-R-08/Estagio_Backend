/** Mapeia o valor do foco para instruções explícitas em PT e EN */
function buildFocusInstructions(
  focus: string | undefined,
  isEn: boolean,
): string {
  if (!focus) return '';

  const normalised = focus.toLowerCase().trim();

  if (isEn) {
    if (normalised.includes('practic') || normalised.includes('hands-on')) {
      return `Focus directive: The user wants a PRACTICAL approach.
- Heavily weight hands-on exercises, projects, and real-world applications in every phase.
- Each learningPath phase MUST include at least one concrete exercise or mini-project as a topic.
- studyTips should prioritise doing over reading (e.g. "build X", "replicate Y").
- Reduce time spent on pure theory; reference documentation only when strictly necessary.`;
    }
    if (normalised.includes('theor') || normalised.includes('concept')) {
      return `Focus directive: The user wants a THEORETICAL approach.
- Heavily weight foundational concepts, underlying principles and academic resources in every phase.
- Each learningPath phase MUST include at least one concept deep-dive or reading resource as a topic.
- studyTips should prioritise understanding before doing (e.g. "read the spec", "study the algorithm").
- Practical exercises are secondary; introduce them only to illustrate theory.`;
    }
    // balanced / equilibrado / default
    return `Focus directive: The user wants a BALANCED approach.
- Mix theory and practice equally across phases.
- Each learningPath phase should include both a conceptual topic and a practical exercise.
- studyTips should alternate between understanding concepts and applying them.`;
  }

  // Portuguese
  if (
    normalised.includes('prático') ||
    normalised.includes('pratico') ||
    normalised.includes('hands-on')
  ) {
    return `Directiva de foco: O utilizador quer uma abordagem PRÁTICA.
- Privilegia exercícios práticos, projectos e aplicações reais em cada fase.
- Cada fase do learningPath DEVE incluir pelo menos um exercício concreto ou mini-projecto como tópico.
- As studyTips devem priorizar o "fazer" em vez do "ler" (ex: "constrói X", "replica Y").
- Reduz o tempo em teoria pura; menciona documentação apenas quando estritamente necessário.`;
  }
  if (
    normalised.includes('teórico') ||
    normalised.includes('teorico') ||
    normalised.includes('conceito') ||
    normalised.includes('fundament')
  ) {
    return `Directiva de foco: O utilizador quer uma abordagem TEÓRICA.
- Privilegia conceitos fundamentais, princípios subjacentes e recursos académicos em cada fase.
- Cada fase do learningPath DEVE incluir pelo menos um aprofundamento conceptual ou recurso de leitura como tópico.
- As studyTips devem priorizar a compreensão antes da aplicação (ex: "lê a especificação", "estuda o algoritmo").
- Os exercícios práticos são secundários; usa-os apenas para ilustrar a teoria.`;
  }
  // equilibrado / default
  return `Directiva de foco: O utilizador quer uma abordagem EQUILIBRADA.
- Mistura teoria e prática de forma igual em cada fase.
- Cada fase do learningPath deve incluir tanto um tópico conceptual como um exercício prático.
- As studyTips devem alternar entre compreender conceitos e aplicá-los.`;
}

export function buildCoursePlanPrompt(
  courseTitle: string,
  courseContent: string,
  userProfile: {
    userFunction?: string;
    skills?: string;
    experienceLevel?: string;
  },
  userNotes: string | null,
  userProgress: string | null,
  focus: string | undefined,
  lang: string,
): string {
  const isEn = lang === 'en';

  const profileBlock = isEn
    ? `User profile: ${userProfile.userFunction || 'Professional'} | Level: ${userProfile.experienceLevel || 'N/A'} | Skills: ${userProfile.skills || 'N/A'}`
    : `Perfil do utilizador: ${userProfile.userFunction || 'Profissional'} | Nível: ${userProfile.experienceLevel || 'N/A'} | Skills: ${userProfile.skills || 'N/A'}`;

  const notesBlock = userNotes
    ? isEn
      ? `User's own notes: ${userNotes}`
      : `Notas do utilizador: ${userNotes}`
    : '';

  const progressBlock = userProgress
    ? isEn
      ? `Current progress: ${userProgress}`
      : `Progresso atual: ${userProgress}`
    : '';

  const focusInstructions = buildFocusInstructions(focus, isEn);

  if (isEn) {
    return `Task: Generate a structured learning plan for a specific course.

Course: "${courseTitle}"
Course information:
${courseContent}

${profileBlock}
${notesBlock}
${progressBlock}

${focusInstructions}

Instructions:
1. Analyse the course content and the user's current level.
2. Define clear learning phases with realistic time estimates — strictly following the focus directive above.
3. Identify prerequisites the user should have before starting.
4. List the key objectives the user will achieve.
5. Provide practical study tips tailored to the user's profile and the focus directive.
6. Suggest what to do after completing this course (next steps).

Return ONLY a valid JSON object in this exact format:
{
  "overview": "Brief summary of what this course offers and why it is relevant",
  "prerequisites": ["Prerequisite 1", "Prerequisite 2"],
  "learningPath": [
    { "phase": "Phase name", "topics": ["Topic 1", "Topic 2"], "estimatedTime": "X hours/days" }
  ],
  "keyObjectives": ["Objective 1", "Objective 2"],
  "studyTips": ["Tip 1", "Tip 2"],
  "totalEstimatedTime": "Total estimated time to complete",
  "afterCompletion": "What to do or study after completing this course"
}`.trim();
  }

  return `Tarefa: Gerar um plano de aprendizagem estruturado para um curso específico.

Curso: "${courseTitle}"
Informação sobre o curso:
${courseContent}

${profileBlock}
${notesBlock}
${progressBlock}

${focusInstructions}

Instruções:
1. Analisa o conteúdo do curso e o nível atual do utilizador.
2. Define fases de aprendizagem claras com estimativas de tempo realistas — seguindo estritamente a directiva de foco acima.
3. Identifica os pré-requisitos que o utilizador deve ter antes de começar.
4. Lista os objetivos principais que o utilizador irá alcançar.
5. Dá dicas de estudo adaptadas ao perfil do utilizador e à directiva de foco.
6. Sugere o que fazer após terminar este curso (próximos passos).

Retorna APENAS um JSON válido neste formato exato:
{
  "overview": "Resumo breve do que o curso oferece e por que é relevante",
  "prerequisites": ["Pré-requisito 1", "Pré-requisito 2"],
  "learningPath": [
    { "phase": "Nome da fase", "topics": ["Tópico 1", "Tópico 2"], "estimatedTime": "X horas/dias" }
  ],
  "keyObjectives": ["Objetivo 1", "Objetivo 2"],
  "studyTips": ["Dica 1", "Dica 2"],
  "totalEstimatedTime": "Tempo total estimado para completar",
  "afterCompletion": "O que fazer ou estudar após completar este curso"
}`.trim();
}

