/**
 * src/ai/templates/certificate.template.ts
 * Template especializado para extração estruturada de metadados de certificados.
 */

export function buildCertificateExtractionPrompt(
  trainingTitle: string | null,
  fileName: string | null,
  extractedText: string,
  lang: string = 'pt'
): string {
  return `Sistema: Extração Especializada de Metadados de Certificados.
Tarefa: Extrai informações estruturadas do texto OCR de um certificado de forma robusta e flexível.
Contexto: O utilizador carregou um certificado para o curso "${trainingTitle || 'N/A'}" com o nome de ficheiro "${fileName || 'N/A'}".

Texto Extraído do Certificado (OCR):
"""
${extractedText}
"""

Instruções:
1. Deteção de Idioma: Identifica se o certificado está em Português (pt) ou Inglês (en).
2. Campos podem variar entre certificados. Preenche apenas o que existir de forma clara.
3. Nunca inventes valores. Se não existir informação suficiente, usa null.
4. Instituição: entidade emissora (ex: IBM, Udemy, LinkedIn Learning, Microsoft, Softinsa).
5. Nome do Curso: nome exato do curso/certificação quando explícito.
6. Datas: data de conclusão e data de expiração se existirem.
7. Competências: identifica skills técnicas/comportamentais explícitas.
8. Credencial: id/código/url de verificação quando disponível.
9. Confiança: high|medium|low conforme legibilidade e consistência.

Retorna APENAS JSON válido seguindo este formato:
{
  "institution": "Nome da Entidade",
  "courseName": "Nome do Curso",
  "durationHours": 0,
  "date": "YYYY-MM-DD",
  "expirationDate": "YYYY-MM-DD",
  "participantName": "Nome do titular",
  "credentialId": "ID ou código da credencial",
  "credentialUrl": "https://...",
  "score": "pontuação",
  "grade": "classificação",
  "language": "pt|en",
  "skills": ["Skill 1", "Skill 2"],
  "confidence": "high|medium|low",
  "evidence": {
    "rawDateText": "texto original da data",
    "rawDurationText": "texto original da duração"
  }
}`.trim();
}
