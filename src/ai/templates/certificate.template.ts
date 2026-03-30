/**
 * src/ai/templates/certificate.template.ts
 * Templates compactados para Llama 3.3 (Audit Production).
 */

export function buildCertificateExtractionPrompt(
  courseTitle: string,
  filename: string,
  documentText: string,
  lang: string = 'pt',
  hints: { courseName?: string; provider?: string } = {},
): string {
  const isEn = lang.toLowerCase() === 'en';
  const label = isEn ? 'English' : 'Portuguese (Portugal)';

  return `Task: Extract certificate metadata. Language: ${label}.
Input: ${isEn ? 'Expected Title' : 'Título Esperado'} "${courseTitle}", File "${filename}".
${hints.courseName ? (isEn ? `Hint Name: "${hints.courseName}"` : `Sugestão Nome: "${hints.courseName}"`) : ''}
${hints.provider ? (isEn ? `Hint Provider: "${hints.provider}"` : `Sugestão Fornecedor: "${hints.provider}"`) : ''}

### DOCUMENT CONTENT (OCR)
${documentText || (isEn ? 'Not readable.' : 'Sem texto legível.')}

### JSON FORMAT (Strict ISO-8601)
{
  "courseName": "Full found name",
  "provider": "Issuer (Microsoft, AWS, etc.)",
  "completionDate": "YYYY-MM-DD or null",
  "expirationDate": "YYYY-MM-DD or null",
  "durationHours": number or null,
  "confidence": "high|medium|low"
}
JSON:`.trim();
}
