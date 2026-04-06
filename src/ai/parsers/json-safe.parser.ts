import { Logger } from '@nestjs/common';
import { z } from 'zod';

export class JsonSafeParser {
  private static readonly logger = new Logger(JsonSafeParser.name);

  /**
   * Limpa e valida um JSON retornado por um LLM usando Zod.
   * Suporta limpeza de tags markdown e caracteres indesejados.
   */
  static parse<S extends z.ZodTypeAny>(
    raw: string,
    schema: S,
  ): z.output<S> | null {
    if (!raw) return null;

    try {
      // 1. Limpeza agressiva de markdown ```json ... ```
      let cleaned = raw.trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      // 2. Parse básico do objeto
      const parsed = JSON.parse(cleaned) as unknown;

      // 3. Validação via Zod
      const validation = schema.safeParse(parsed);

      if (validation.success) {
        return validation.data as z.output<S>;
      }

      this.logger.warn(
        `Zod Validation Failure: ${JSON.stringify(validation.error.format())}`,
      );
      return null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to parse JSON: ${msg}. Input was: ${raw.substring(0, 50)}...`,
      );
      return null;
    }
  }

  /**
   * Tenta extrair um array de JSON se o modelo falhar na instrução.
   */
  static parseArray<S extends z.ZodTypeAny>(
    raw: string,
    schema: S,
  ): z.output<S>[] {
    try {
      let cleaned = raw.trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        cleaned = arrayMatch[0];
      }
      const parsed = JSON.parse(cleaned) as unknown;
      const validation = schema.safeParse(parsed);
      return validation.success
        ? (validation.data as z.output<S>[])
        : ([] as z.output<S>[]);
    } catch {
      return [] as z.output<S>[];
    }
  }
}


