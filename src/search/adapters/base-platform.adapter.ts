import { Logger } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { CourseResult, IPlatformAdapter, PlatformConfig } from '../interfaces/platform-adapter.interface';

export abstract class BasePlatformAdapter implements IPlatformAdapter {
  protected abstract readonly logger: Logger;
  abstract readonly platformName: string;
  private readonly CACHE_VERSION = 'v3';
  
  private errorCount = 0;
  private readonly MAX_ERRORS = 5;
  private circuitOpenUntil = 0;
  private readonly CIRCUIT_BREAKER_COOLDOWN = 60000; // 1 minuto

  constructor(
    protected readonly cache: CacheService,
    protected readonly platform: PlatformConfig,
  ) {}

  /**
   * Método principal de pesquisa com caching e circuit breaker
   */
  async search(
    query: string, 
    limit: number, 
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }
  ): Promise<CourseResult[]> {
    
    // 1. Check Circuit Breaker
    if (Date.now() < this.circuitOpenUntil) {
      this.logger.warn(`[${this.platformName}] Circuit breaker aberto. Ignorando pesquisa.`);
      return [];
    }

    // 2. Check Cache
    const cacheKey = `course_cache:${this.CACHE_VERSION}:${this.platformName.toLowerCase().replace(/\s+/g, '_')}:${query.toLowerCase()}:${JSON.stringify(filters)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`[${this.platformName}] Cache hit para: "${query}"`);
      return JSON.parse(cached);
    }

    try {
      // 3. Rate Limiting / Delay (Opcional, pode ser personalizado por adapter)
      await this.handleRateLimit();

      // 4. Executa a pesquisa real (implementada pelas subclasses)
      const results = await this.fetchResults(query, limit, filters);
      
      // 5. Reset Error Count on success
      this.errorCount = 0;

      // 6. Save to Cache (TTL 1 hora por defeito)
      await this.cache.set(cacheKey, JSON.stringify(results), 3600);
      
      return results;
    } catch (error) {
      this.handleError(error);
      return [];
    }
  }

  /**
   * Implementação obrigatória da pesquisa específica de cada plataforma
   */
  protected abstract fetchResults(
    query: string, 
    limit: number, 
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }
  ): Promise<CourseResult[]>;

  /**
   * Lógica de rate limit (pode ser sobrescrita)
   */
  protected async handleRateLimit(): Promise<void> {
    // Default: no delay
  }

  /**
   * Gestão de erros e state do Circuit Breaker
   */
  private handleError(error: any): void {
    this.errorCount++;
    this.logger.error(`[${this.platformName}] Erro na pesquisa (${this.errorCount}/${this.MAX_ERRORS}): ${error.message || error}`);

    if (this.errorCount >= this.MAX_ERRORS) {
      this.circuitOpenUntil = Date.now() + this.CIRCUIT_BREAKER_COOLDOWN;
      this.logger.warn(`[${this.platformName}] Limite de erros atingido. Circuit breaker aberto por 1 minuto.`);
      this.errorCount = 0; // Reset para a próxima tentativa após cooldown
    }
  }
}
