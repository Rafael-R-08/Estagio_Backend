import { Injectable, Logger } from '@nestjs/common';
const pdf = require('pdf-parse');

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  /**
   * Extrai texto de um buffer de PDF.
   * Suporta PDFs grandes e limita a extração inicial para evitar sobrecarga.
   */
  async extractText(buffer: Buffer, maxPages = 20): Promise<string> {
    try {
      this.logger.log(`A extrair texto de PDF (${buffer.length} bytes)...`);
      
      const options = {
        max: maxPages, // Limitar numero de paginas para performance se necessário
      };

      const data = await pdf(buffer, options);
      
      // Limpeza básica do texto
      const cleanText = data.text
        .replace(/\u0000/g, '') // Remover caracteres nulos
        .replace(/\s+/g, ' ')   // Normalizar espaços
        .trim();

      if (!cleanText || cleanText.length < 10) {
        this.logger.warn('Aviso: Extração de PDF retornou pouco ou nenhum texto.');
      }

      return cleanText;
    } catch (error: any) {
      this.logger.error(`Falha ao processar PDF: ${error.message}`);
      throw new Error(`Erro no parsing do PDF: ${error.message}`);
    }
  }
}
