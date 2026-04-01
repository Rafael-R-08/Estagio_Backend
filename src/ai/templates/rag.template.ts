/**
 * src/ai/templates/rag.template.ts
 * Templates bilingues avançados para Groq (Llama 3.3).
 */

export function buildRagPrompt(context: string, query: string, lang: string = 'pt'): string {
  const isEn = lang.toLowerCase() === 'en';
  
  if (isEn) {
    return `Assistant: Softinsa Career AI. 
Role: You are a specialized career consultant for Softinsa (IBM subsidiary).
Guidelines: 
1. Use the CONTEXT to answer. 
2. Use the CHAT HISTORY for continuity.
3. If information is missing, rely on specialized IT/Cloud knowledge.
4. Tone: Technical, helpful, and executive.

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

### CONTEXTO:
${context}

### PERGUNTA: ${query}
### RESPOSTA:`.trim();
}

export function buildRecommendationPrompt(
  profile: any,
  context: string,
  query: string,
  lang: string = 'pt',
): string {
  const isEn = lang.toLowerCase() === 'en';
  
  const interests = profile.interests.join(', ') || 'General IT';
  const skills = profile.skills?.map((s: any) => `${s.skillName}(${s.level})`).join(', ') || 'N/A';
  const exclude = profile.completedTrainings.concat(profile.ongoingTrainings || []).join(', ');

  const promptBase = isEn 
    ? `System: Recommendation Engine. Task: Personal Development Plan (PDP).
Profile: ${profile.userFunction} at ${profile.serviceLine}. Level: ${profile.experienceLevel}.
Skills: ${skills}. Interests: ${interests}.
Knowledge Base: ${context}
Rule: NEVER recommend: [${exclude}].

Chain-of-Thought:
1. Analyze the user's role and skill gaps.
2. Match with available courses in the context.
3. Justify each choice based on career growth.

Return ONLY a valid JSON following this format:
{
  "improvement": "Professional improvement suggestions...",
  "interests": "Interest-based suggestions...",
  "missing_skills": "Skill gap suggestions..."
}`

    : `Sistema: Motor de Recomendações. Tarefa: Plano de Desenvolvimento Pessoal (PDP).
Perfil: ${profile.userFunction} na área ${profile.serviceLine}. Nível: ${profile.experienceLevel}.
Skills: ${skills}. Interesses: ${interests}.
Base de Conhecimento: ${context}
Regra: NUNCA recomendar: [${exclude}].

Cadeia de Pensamento:
1. Analisa a função e os gaps de competência.
2. Faz o match com cursos disponíveis no contexto.
3. Justifica cada escolha com base em crescimento de carreira.

Retorna APENAS JSON válido seguindo este formato:
{
  "improvement": "Sugestões de melhoria profissional...",
  "interests": "Sugestões com base em interesses...",
  "missing_skills": "Sugestões para novas competências..."
}`;

  return promptBase.trim();
}
