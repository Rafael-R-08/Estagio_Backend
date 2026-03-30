/**
 * src/ai/templates/rag.template.ts
 * Templates compactados para Llama 3.3 (Audit Production).
 */

export function buildRagPrompt(context: string, query: string, lang: string = 'pt'): string {
  const isEn = lang.toLowerCase() === 'en';
  
  if (isEn) {
    return `Assistant: Softinsa Career & Training. Language: English.
Instructions: Answer based on CONTEXT. If missing, use general IT knowledge. Use PROFILE if provided. Tone: Helpful/Professional.
### CONTEXT
${context}
### QUESTION: ${query}
### ANSWER:`.trim();
  }

  return `Assistente: Carreira e Formação Softinsa. Idioma: PT-PT.
Instruções: Responde com base no CONTEXTO. Se ausente, usa conhecimento geral TI. Usa PERFIL se disponível. Tom: Profissional/Útil.
### CONTEXTO
${context}
### PERGUNTA: ${query}
### RESPOSTA:`.trim();
}

export function buildRecommendationPrompt(
  profile: {
    interests: string[];
    experienceLevel: string;
    completedTrainings: string[];
    ongoingTrainings?: string[];
    serviceLine?: string;
    userFunction?: string;
    skills?: { skillName: string; level: string; yearsOfExperience: number }[];
  },
  context: string,
  query: string,
  lang: string = 'pt',
): string {
  const isEn = lang.toLowerCase() === 'en';
  const none = isEn ? 'none' : 'nenhuma';
  
  const interests = profile.interests.join(', ') || none;
  const skills = profile.skills?.map(s => `${s.skillName}(${s.level})`).join(', ') || none;
  const exclude = profile.completedTrainings.concat(profile.ongoingTrainings || []).join(', ');

  if (isEn) {
    return `Career Consultant: Softinsa. Language: English.
Profile: Role ${profile.userFunction} (${profile.serviceLine}), Level ${profile.experienceLevel}, Skills: ${skills}, Interests: ${interests}.
Knowledge Base: ${context || 'General IT knowledge.'}
Rule: NEVER recommend completed/ongoing: [${exclude}].

Task: ${query}
Format: JSON only.
{
  "improvement": "Growth recommendations for ${profile.userFunction}. Markdown with **Course** and brief Reason.",
  "interests": "Based on interests: ${interests}. Markdown.",
  "missing_skills": "To close gaps in ${skills}. Markdown."
}
JSON:`.trim();
  }

  return `Consultor: Carreira Softinsa. Idioma: PT-PT.
Perfil: ${profile.userFunction} (${profile.serviceLine}), Nível ${profile.experienceLevel}, Skills: ${skills}, Interesses: ${interests}.
Base: ${context || 'Conhecimento geral TI.'}
Regra: NUNCA recomendar concluídos/em curso: [${exclude}].

Tarefa: ${query}
Formato: Apenas JSON.
{
  "improvement": "Crescimento profissional para ${profile.userFunction}. Markdown com **Curso** e Razão curta.",
  "interests": "Baseado em interesses: ${interests}. Markdown.",
  "missing_skills": "Para fechar gaps em ${skills}. Markdown."
}
JSON:`.trim();
}
