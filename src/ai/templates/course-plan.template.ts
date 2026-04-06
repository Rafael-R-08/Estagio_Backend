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

  const focusBlock = focus
    ? isEn
      ? `Specific focus requested by user: ${focus}`
      : `Foco específico pedido pelo utilizador: ${focus}`
    : '';

  if (isEn) {
    return `Task: Generate a structured learning plan for a specific course.

Course: "${courseTitle}"
Course information:
${courseContent}

${profileBlock}
${notesBlock}
${progressBlock}
${focusBlock}

Instructions:
1. Analyse the course content and the user's current level.
2. Define clear learning phases with realistic time estimates.
3. Identify prerequisites the user should have before starting.
4. List the key objectives the user will achieve.
5. Provide practical study tips tailored to the user's profile.
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
${focusBlock}

Instruções:
1. Analisa o conteúdo do curso e o nível atual do utilizador.
2. Define fases de aprendizagem claras com estimativas de tempo realistas.
3. Identifica os pré-requisitos que o utilizador deve ter antes de começar.
4. Lista os objetivos principais que o utilizador irá alcançar.
5. Dá dicas de estudo práticas adaptadas ao perfil do utilizador.
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
