import { Logger } from '@nestjs/common';
import { z } from 'zod';

export class JsonSafeParser {
  private static readonly logger = new Logger(JsonSafeParser.name);

  /**
   * Limpa e valida um JSON retornado por um LLM usando Zod.
   * Suporta limpeza de tags markdown e caracteres indesejados.
   */
  static parse<T>(raw: string, schema: z.ZodSchema<T>): T | null {
    if (!raw) return null;

    try {
      // 1. Limpeza agressiva de markdown ```json ... ```
      let cleaned = raw.trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      // 2. Parse básico do objeto
      const parsed = JSON.parse(cleaned);

      // 3. Validação via Zod
      const validation = schema.safeParse(parsed);
      
      if (validation.success) {
        return validation.data;
      }

      this.logger.warn(`Zod Validation Failure: ${JSON.stringify(validation.error.format())}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to parse JSON: ${error.message}. Input was: ${raw.substring(0, 50)}...`);
      return null;
    }
  }

  /**
   * Tenta extrair um array de JSON se o modelo falhar na instrução.
   */
  static parseArray<T>(raw: string, schema: z.ZodSchema<T[]>): T[] {
    try {
      let cleaned = raw.trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        cleaned = arrayMatch[0];
      }
      const parsed = JSON.parse(cleaned);
      const validation = schema.safeParse(parsed);
      return validation.success ? validation.data : [];
    } catch {
      return [];
    }
  }
}
