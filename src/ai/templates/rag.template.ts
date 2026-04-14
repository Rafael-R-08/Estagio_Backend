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
1. Use the CONTEXT to answer. Only recommend courses and platforms that appear explicitly in the CONTEXT — never invent or assume courses exist outside it.
2. Use the CHAT HISTORY for continuity.
3. If the CONTEXT does not contain information to answer a specific question (e.g. certifications, external platforms), say so honestly and suggest the user consult their manager or HR — do NOT fill gaps with general knowledge.
4. Calibrate recommendations to the user's skill level shown in their profile. Do not recommend advanced courses to users with beginner-level skills in that area.
5. Tone: Technical, helpful, and executive.
6. IMPORTANT: The CONTEXT uses internal [REF:...] markers — NEVER include these markers in your response. Write naturally using the course titles and descriptions only.
${mentionBlock}
### CONTEXT:
${context}

### USER QUESTION: ${query}
### YOUR RESPONSE:`.trim();
  }

  return `Assistente: IA de Carreira Softinsa.
Papel: És um consultor especializado em formação e carreira para a Softinsa (subsidiária IBM).
Instruções:
1. Usa o CONTEXTO para responder. Apenas recomenda cursos e plataformas que apareçam explicitamente no CONTEXTO — nunca inventes ou assumas cursos fora dele.
2. Considera o HISTÓRICO da conversa para manter a continuidade.
3. Se o CONTEXTO não contiver informação suficiente para responder a uma questão específica (ex: certificações, plataformas externas), diz-o de forma honesta e sugere ao utilizador que consulte o seu manager ou RH — NÃO preenchas lacunas com conhecimento geral.
4. Calibra as recomendações ao nível de cada skill do utilizador indicado no perfil. Não recomendaras cursos avançados a utilizadores com nível iniciante nessa área.
5. Tom: Profissional, direto e motivador.
6. IMPORTANTE: O CONTEXTO usa marcadores internos [REF:...] — NUNCA os incluas na resposta. Escreve de forma natural usando apenas os títulos e descrições dos cursos.
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
Rule: Return AT LEAST 1 course per category (improvement, interests, missing_skills) when suitable courses exist, up to 3 per category, max 9 total. Every category must be represented whenever the catalogue allows it.
Rule: Each recommended course MUST be clearly distinct from all others — never recommend two courses that cover the same or very similar topic, regardless of category. Prioritise breadth over repetition.
Rule: Match course level to the user's skill level for that topic. For junior/beginner users, prefer Beginner courses unless their skill profile explicitly shows a higher level in that specific area. Do NOT recommend Intermediate or Advanced courses to users with beginner-level skills in the relevant topic.
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
Regra: Devolve PELO MENOS 1 curso por categoria (improvement, interests, missing_skills) sempre que existam cursos adequados, até 3 por categoria, máx. 9 no total. Cada categoria deve estar sempre representada quando o catálogo o permitir.
Regra: Cada curso recomendado DEVE ser claramente distinto de todos os outros — nunca recomendaras dois cursos que abordem o mesmo tópico ou tópicos muito semelhantes, independentemente da categoria. Prioriza a diversidade temática.
Regra: Adequa o nível do curso ao nível de skill do utilizador para esse tópico. Para utilizadores júnior/iniciante, prefere cursos Beginner salvo se o perfil de skills indicar explicitamente um nível mais elevado nessa área específica. NÃO recomendaras cursos Intermediate ou Advanced a utilizadores com nível iniciante no tópico relevante.
Regra: Se NÃO existir nenhum curso adequado no catálogo, define hasContextualCourses=false e devolve courses=[].

### CATÁLOGO DE CURSOS:
${courseList || '(catálogo vazio — nenhum curso indexado ainda)'}

Devolve APENAS JSON válido seguindo este esquema:
${schema}`.trim();
}
