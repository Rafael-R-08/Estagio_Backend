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
  const isEn = lang.toLowerCase() === 'en';

  return `Sistema: Extração Especializada de Metadados de Certificados.
Tarefa: Extrai informações precisas e estruturadas do texto OCR de um certificado.
Contexto: O utilizador carregou um certificado para o curso "${trainingTitle || 'N/A'}" com o nome de ficheiro "${fileName || 'N/A'}".

Texto Extraído do Certificado (OCR):
"""
${extractedText}
"""

Instruções:
1. Deteção de Idioma: Identifica se o certificado está em Português (pt) ou Inglês (en).
2. Instituição: Qual a entidade que emite o certificado (ex: IBM, Udemy, LinkedIn Learning, Microsoft, Softinsa).
3. Nome do Curso: Extrai o nome exato do curso mostrado no documento.
4. Data: Extrai a data de conclusão (formato ISO 8601 se possível).
5. Competências: Identifica as skills técnicas ou comportamentais mencionadas.
6. Confiança: Avalia se o texto é legível o suficiente para uma extração precisa.

Retorna APENAS JSON válido seguindo este formato:
{
  "institution": "Nome da Entidade",
  "courseName": "Nome do Curso",
  "durationHours": 0,
  "date": "YYYY-MM-DD",
  "language": "pt|en",
  "skills": ["Skill 1", "Skill 2"],
  "confidence": "high|medium|low"
}`.trim();
}
