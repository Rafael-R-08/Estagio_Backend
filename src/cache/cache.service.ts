import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

const CACHE_TTL_SECONDS = 60 * 60; // 1 hora para respostas LLM
const EMBED_TTL_SECONDS = 60 * 60 * 24; // 24 horas para embeddings (mais estáveis)

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: RedisClientType | null = null;
  private redisAvailable = false;

  // Cache em memória como fallback
  private readonly memoryCache = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    void this.connectRedis();
  }

  private async connectRedis() {
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      }) as RedisClientType;

      this.redis.on('error', (err) => {
        if (this.redisAvailable) {
          this.logger.warn(`Redis desconectado: ${err.message}. A usar cache em memória.`);
          this.redisAvailable = false;
        }
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis conectado com sucesso.');
        this.redisAvailable = true;
      });

      await this.redis.connect();
    } catch {
      this.logger.warn('Redis não disponível. A usar cache em memória como fallback.');
      this.redisAvailable = false;
    }
  }

  async onModuleDestroy() {
    if (this.redis && this.redisAvailable) {
      await this.redis.disconnect();
    }
  }

  /**
   * Encapsula uma chamada com cache (Redis ou memória)
   */
  async getOrSet<T>(cacheKey: string, fn: () => Promise<T>): Promise<T> {
    // 1. Verificar cache
    const cached = await this.getFromCache(cacheKey);
    if (cached !== null) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return JSON.parse(cached) as T;
    }

    // 2. Executar a chamada
    const result = await fn();

    // 3. Guardar no cache
    const ttl = cacheKey.startsWith('embed:') ? EMBED_TTL_SECONDS : CACHE_TTL_SECONDS;
    await this.setInCache(cacheKey, JSON.stringify(result), ttl);

    return result;
  }

  private async getFromCache(key: string): Promise<string | null> {
    // Tenta Redis primeiro
    if (this.redis && this.redisAvailable) {
      try {
        return await this.redis.get(key);
      } catch {
        this.redisAvailable = false;
      }
    }
    // Fallback: memória
    const entry = this.memoryCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value;
    }
    this.memoryCache.delete(key);
    return null;
  }

  private async setInCache(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Tenta Redis primeiro
    if (this.redis && this.redisAvailable) {
      try {
        await this.redis.set(key, value, { EX: ttlSeconds });
        return;
      } catch {
        this.redisAvailable = false;
      }
    }
    // Fallback: memória
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /** Invalida uma chave de cache */
  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (this.redis && this.redisAvailable) {
      await this.redis.del(key).catch(() => null);
    }
  }

  /** Estatísticas do serviço */
  getStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      redisAvailable: this.redisAvailable,
    };
  }
}
