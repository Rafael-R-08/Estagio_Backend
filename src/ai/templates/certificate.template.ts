// src/ai/templates/certificate.template.ts
export function buildCertificateExtractionPrompt(
  courseTitle: string,
  filename: string,
  documentText: string,
  hints: { courseName?: string; provider?: string } = {},
): string {
  return `Analisa as informações do certificado e extrai os metadados em JSON para o sistema da Softinsa.
Responde SEMPRE em Português de Portugal (PT-PT).

INFORMAÇÃO BASE:
- Título da Formação Esperada: "${courseTitle}"
- Nome do Ficheiro: "${filename}"
${hints.courseName ? `- Nome sugerido: "${hints.courseName}"` : ''}
${hints.provider ? `- Fornecedor sugerido: "${hints.provider}"` : ''}

CONTEÚDO EXTRAÍDO DO DOCUMENTO (OCR):
${documentText || '(Conteúdo não legível, usa os nomes acima)'}

REQUISITO: Responde APENAS com um JSON válido com estes campos:
{
  "courseName": "nome completo do curso encontrado",
  "provider": "entidade emissora (ex: Microsoft, Coursera, Udemy, IBM)",
  "completionDate": "data de conclusão em formato ISO 8601 ou null",
  "expirationDate": "data de validade em formato ISO 8601 ou null",
  "durationHours": número de horas ou null,
  "confidence": "high|medium|low"
}`.trim();
}
