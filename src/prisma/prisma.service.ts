// src/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Garantimos um único Pool para toda a app
  private static pool: Pool | null = null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL não definida. Verifica o teu .env');
    }

    // Cria o Pool apenas uma vez
    if (!PrismaService.pool) {
      PrismaService.pool = new Pool({ connectionString });
    }

    const adapter = new PrismaPg(PrismaService.pool);

    super({
      adapter,
      log: [
        { level: 'query', emit: 'event' },
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    // Fecha o Pool quando a app encerra (evita sockets abertos)
    if (PrismaService.pool) {
      await PrismaService.pool.end();
      PrismaService.pool = null;
    }
  }
}
