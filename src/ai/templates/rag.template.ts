/**
 * src/ai/templates/rag.template.ts
 * Templates bilingues avançados para Groq (Llama 3.3).
 */

interface RecommendationProfile {
  interests: string[];
  experienceLevel: string;
  completedTrainings: string[];
  ongoingTrainings?: string[];
  serviceLine?: string;
  userFunction: string;
  skills?: { skillName: string; level: string }[];
}

export function buildRagPrompt(
  context: string,
  query: string,
  lang: string = 'pt',
  mentionedTitles: string[] = [],
): string {
  const isEn = lang.toLowerCase() === 'en';
  const mentionBlock = mentionedTitles.length
    ? isEn
      ? `\nNOTE: The user has explicitly mentioned these course(s): ${mentionedTitles.map((t) => `"${t}"`).join(', ')}. Focus your answer on these specific course(s) using the MENTIONED COURSES section above.\n`
      : `\nNOTA: O utilizador mencionou explicitamente estes curso(s): ${mentionedTitles.map((t) => `"${t}"`).join(', ')}. Foca a tua resposta nestes cursos específicos utilizando a secção de CURSOS MENCIONADOS acima.\n`
    : '';

  if (isEn) {
    return `Assistant: Softinsa Career AI.
Role: You are a specialized career consultant for Softinsa (IBM subsidiary).
Guidelines:
1. Use the CONTEXT to answer.
2. Use the CHAT HISTORY for continuity.
3. If information is missing, rely on specialized IT/Cloud knowledge.
4. Tone: Technical, helpful, and executive.
${mentionBlock}
### CONTEXT:
${context}

### USER QUESTION: ${query}
### YOUR RESPONSE:`.trim();
  }

  return `Assistente: IA de Carreira Softinsa.
Papel: És um consultor especializado em formação e carreira para a Softinsa (subsidiária IBM).
Instruções:
1. Usa o CONTEXTO para responder com precisão.
2. Considera o HISTÓRICO da conversa para manter a continuidade.
3. Se o contexto for insuficiente, usa conhecimentos técnicos de TI/Cloud.
4. Tom: Profissional, direto e motivador.
${mentionBlock}
### CONTEXTO:
${context}

### PERGUNTA: ${query}
### RESPOSTA:`.trim();
}

export function buildRecommendationPrompt(
  profile: RecommendationProfile,
  courseList: string,
  lang: string = 'pt',
): string {
  const isEn = lang.toLowerCase() === 'en';
  const interests =
    profile.interests.join(', ') || (isEn ? 'General IT' : 'TI Geral');
  const skills =
    profile.skills?.map((s) => `${s.skillName}(${s.level})`).join(', ') ||
    'N/A';
  const exclude = profile.completedTrainings
    .concat(profile.ongoingTrainings || [])
    .join(', ');

  const schema = `{
  "courses": [
    {
      "title": "<exact title from the list>",
      "category": "improvement" | "interests" | "missing_skills",
      "reason": "<personalised justification in 1-2 sentences>",
      "level": "<level if available>",
      "estimatedHours": <number or null>
    }
  ],
  "hasContextualCourses": true,
  "summary": "<personalised 1-2 sentence summary>"
}`;

  if (isEn) {
    return `System: Personalised Course Recommendation Engine.
Profile: ${profile.userFunction} at ${profile.serviceLine || 'Softinsa'}. Level: ${profile.experienceLevel}. Skills: ${skills}. Interests: ${interests}.
Rule: NEVER recommend already completed/ongoing courses: [${exclude || 'none'}].
Rule: ONLY recommend courses from the numbered catalogue below. Do NOT invent titles.
Rule: Return up to 3 courses per category (improvement, interests, missing_skills), max 9 total.
Rule: If NO suitable course exists in the catalogue, set hasContextualCourses=false and return an empty courses array.

### COURSE CATALOGUE:
${courseList || '(empty catalogue — no courses indexed yet)'}

Return ONLY valid JSON matching this schema:
${schema}`.trim();
  }

  return `Sistema: Motor de Recomendação de Cursos Personalizado.
Perfil: ${profile.userFunction} na área ${profile.serviceLine || 'Softinsa'}. Nível: ${profile.experienceLevel}. Skills: ${skills}. Interesses: ${interests}.
Regra: NUNCA recomendar cursos já concluídos/em curso: [${exclude || 'nenhum'}].
Regra: APENAS recomenda cursos do catálogo numerado abaixo. NÃO inventes títulos.
Regra: Devolve até 3 cursos por categoria (improvement, interests, missing_skills), máx. 9 no total.
Regra: Se NÃO existir nenhum curso adequado no catálogo, define hasContextualCourses=false e devolve courses=[].

### CATÁLOGO DE CURSOS:
${courseList || '(catálogo vazio — nenhum curso indexado ainda)'}

Devolve APENAS JSON válido seguindo este esquema:
${schema}`.trim();
}
