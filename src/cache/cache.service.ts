// src/cache/cache.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

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
   * Obtém um valor do cache
   */
  async get(key: string): Promise<string | null> {
    if (this.redis && this.redisAvailable) {
      try {
        return await this.redis.get(key);
      } catch {
        this.redisAvailable = false;
      }
    }

    const entry = this.memoryCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value;
    }
    
    if (entry) {
      this.memoryCache.delete(key);
    }
    return null;
  }

  /**
   * Define um valor no cache com TTL em segundos
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redis && this.redisAvailable) {
      try {
        await this.redis.set(key, value, { EX: ttlSeconds });
        return;
      } catch {
        this.redisAvailable = false;
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Remove uma chave específica
   */
  async del(key: string): Promise<void> {
    if (this.redis && this.redisAvailable) {
      try {
        await this.redis.del(key);
      } catch {
        this.redisAvailable = false;
      }
    }
    this.memoryCache.delete(key);
  }

  /**
   * Invalida chaves que correspondam a um padrão (ex: "ai:user123:*")
   */
  async invalidatePattern(pattern: string): Promise<void> {
    this.logger.log(`Invalidando cache com padrão: ${pattern}`);
    
    // Redis: usa SCAN ou KEYS (KEYS é bloqueante, mas para este caso pequeno é aceitável)
    if (this.redis && this.redisAvailable) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(keys);
          this.logger.log(`Redis: Removidas ${keys.length} chaves.`);
        }
      } catch (error) {
        this.logger.error(`Erro ao invalidar padrão no Redis: ${error.message}`);
      }
    }

    // Memória: itera sobre as chaves
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    let memoryCount = 0;
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
        memoryCount++;
      }
    }
    if (memoryCount > 0) {
      this.logger.log(`Memória: Removidas ${memoryCount} chaves.`);
    }
  }

  /**
   * Legacy: getOrSet para compatibilidade (OPCIONAL se quiseres migrar tudo, mas mantemos por segurança)
   */
  async getOrSet<T>(cacheKey: string, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get(cacheKey);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }

    const result = await fn();
    const ttl = cacheKey.startsWith('embed:') ? 86400 : 3600;
    await this.set(cacheKey, JSON.stringify(result), ttl);

    return result;
  }

  getStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      redisAvailable: this.redisAvailable,
    };
  }
}
