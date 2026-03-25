// src/ai/services/embedding.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service.js';
import { ChunkSource } from '@prisma/client';

export interface SearchResult {
  id: string;
  content: string;
  metadata?: any;
  similarity: number;
  source: ChunkSource;
  createdAt: Date;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  /**
   * Indexa um chunk de texto gerando e armazenando seu embedding com metadados de fonte
   */
  async indexChunk(
    content: string, 
    source: ChunkSource = ChunkSource.RAG_KNOWLEDGE, 
    sourceId?: string, 
    metadata?: Record<string, any>
  ) {
    this.logger.log(`Indexando chunk [${source}]: ${content.substring(0, 50)}...`);

    try {
      const embedding = await this.aiService.embed(content);
      const embeddingStr = `[${embedding.join(',')}]`;
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      // Usamos queryRawUnsafe com placeholders para suportar o tipo vector
      const result = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO "text_chunks" (
          id, content, embedding, source, "sourceId", metadata, "createdAt", "lastUpdatedAt"
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2::vector,
          $3::"ChunkSource",
          $4,
          $5::jsonb,
          NOW(),
          NOW()
        )
        RETURNING id, content, source, "sourceId", metadata, "createdAt"
      `, content, embeddingStr, source, sourceId || null, metadataJson);

      return result[0];
    } catch (error: any) {
      this.logger.error(`Erro ao indexar chunk: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pesquisa chunks similares com filtro opcional por fonte
   */
  async searchSimilar(
    query: string, 
    topK: number = 5, 
    sourceFilter?: ChunkSource[]
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.aiService.embed(query);
      const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;

      let whereClause = '';
      let params: any[] = [queryEmbeddingStr, topK];
      
      if (sourceFilter && sourceFilter.length > 0) {
        const placeholders = sourceFilter.map((_, i) => `$${i + 3}`).join(',');
        whereClause = `WHERE source IN (${placeholders})`;
        params = [...params, ...sourceFilter];
      }

      const querySql = `
        SELECT 
          id, content, source, metadata, "createdAt",
          (embedding <=> $1::vector) as distance
        FROM "text_chunks"
        ${whereClause}
        ORDER BY distance ASC
        LIMIT $2
      `;

      const results = await this.prisma.$queryRawUnsafe<any[]>(querySql, ...params);

      return results.map(row => ({
        id: row.id,
        content: row.content,
        source: row.source,
        metadata: row.metadata,
        similarity: 1 - row.distance,
        createdAt: row.createdAt
      }));
    } catch (error: any) {
      this.logger.error(`Erro na pesquisa semântica: ${error.message}`);
      return [];
    }
  }

  /**
   * Alias para searchSimilar (para compatibilidade com controladores antigos se houver)
   */
  async searchChunks(query: string, limit: number = 5) {
    return this.searchSimilar(query, limit);
  }

  /**
   * Lista chunks indexados
   */
  async listChunks(limit: number = 10) {
    return this.prisma.textChunk.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * Deleta chunks por IDs
   */
  async deleteChunks(ids: string[]) {
    return this.prisma.textChunk.deleteMany({
      where: { id: { in: ids } }
    });
  }

  /**
   * Deleta todos os chunks
   */
  async deleteAll() {
    return this.prisma.textChunk.deleteMany();
  }

  /**
   * Deleta um chunk específico
   */
  async deleteChunk(id: string) {
    return this.prisma.textChunk.delete({ where: { id } });
  }

  /**
   * Estatísticas de indexação
   */
  async getStats() {
    // Usamos cast as any para evitar problemas de lint com o enum no groupBy se o IDE estiver dessincronizado
    const counts = await this.prisma.textChunk.groupBy({
      by: ['source'] as any,
      _count: { id: true }
    });
    return counts.reduce((acc, curr) => ({ 
      ...acc, 
      [curr.source]: (curr._count as any)?.id || 0 
    }), {});
  }
}
