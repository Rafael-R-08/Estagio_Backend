/**
 * src/ai/templates/analysis.template.ts
 * Templates unificados para análise e classificação de cursos.
 */

export function buildFullCourseAnalysisPrompt(course: any): string {
  return `Tarefa: Análise e Classificação Profissional de Curso.
Curso Original: "${course.title}"
Descrição Disponível: "${course.description || 'N/A'}"
Plataforma: ${course.platform?.name || 'Geral'}

Cadeia de Pensamento:
1. Resume o curso de forma profissional.
2. Identifica os 5 principais tópicos abordados.
3. Classifica o curso por Tipo (Technical, Soft Skills, Business, etc).
4. Determina o Nível (Beginner, Intermediate, Advanced).
5. Indica o Perfil Ideal de quem deve fazer este curso na Softinsa.

Retorna APENAS um JSON válido.
{
  "summary": "Resumo executivo em PT-PT.",
  "simplifiedDescription": "Explicação para quem não é da área.",
  "mainTopics": ["Topico 1", "Topico 2", "etc"],
  "classification": {
    "type": "Categoria",
    "level": "Nivel",
    "targetProfile": ["Funcao 1", "Funcao 2"]
  }
}`.trim();
}

/** 
 * Mantidos para compatibilidade temporária se necessário, 
 * mas a recomendação é usar buildFullCourseAnalysisPrompt. 
 */
export const buildSummaryPrompt = (c: any) => `Resumo executivo do curso: ${c.title}`;
export const buildTopicsPrompt = (c: any) => `Tópicos principais do curso: ${c.title}`;
export const buildClassificationPrompt = (c: any) => `Classifica o curso: ${c.title}`;
export const buildSimplifyPrompt = (c: any) => `Explica o que é o curso de forma simples: ${c.title}`;
