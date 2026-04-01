import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChunkSource } from '@prisma/client';
import { pipeline } from '@xenova/transformers';

export interface SearchResult {
  id: string;
  content: string;
  metadata?: any;
  similarity: number;
  source: ChunkSource;
  sourceId?: string;
  createdAt: Date;
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private extractor: any;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log(`Inicializando modelo de embeddings: ${this.modelName}...`);
    try {
      this.extractor = await pipeline('feature-extraction', this.modelName);
      this.logger.log('Modelo de embeddings carregado com sucesso.');
    } catch (error: any) {
      this.logger.error(`Erro ao carregar modelo de embeddings: ${error.message}`);
    }
  }

  /**
   * Gera embedding localmente (384 dimensões)
   */
  async embed(text: string): Promise<number[]> {
    if (!this.extractor) {
      await this.onModuleInit();
    }
    
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data);
  }

  /**
   * Indexa um chunk com o novo vetor de 384 dimensões
   */
  async indexChunk(
    content: string, 
    source: ChunkSource = ChunkSource.RAG_KNOWLEDGE, 
    sourceId?: string, 
    metadata?: Record<string, any>
  ) {
    try {
      const embedding = await this.embed(content);
      const embeddingStr = `[${embedding.join(',')}]`;
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      const result = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO "text_chunks" (
          id, content, embedding, source, "sourceId", metadata, "createdAt"
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2::vector,
          $3::"ChunkSource",
          $4,
          $5::jsonb,
          NOW()
        )
        RETURNING id, content, source
      `, content, embeddingStr, source, sourceId || null, metadataJson);

      return result[0];
    } catch (error: any) {
      this.logger.error(`Erro ao indexar chunk: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pesquisa semântica (Cosine Distance <=> ou Inner Product em vetores normalizados)
   */
  async searchSimilar(
    query: string, 
    topK: number = 5, 
    sourceFilter?: ChunkSource[]
  ): Promise<SearchResult[]> {
    if (!query) return [];
    try {
      const queryEmbedding = await this.embed(query);
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
          id, content, source, "sourceId", metadata, "createdAt",
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
        sourceId: row.sourceId,
        metadata: row.metadata,
        similarity: 1 - (row.distance || 0),
        createdAt: row.createdAt
      }));
    } catch (error: any) {
      this.logger.error(`Erro na pesquisa semântica: ${error.message}`);
      return [];
    }
  }

  async deleteAll() {
    return this.prisma.$executeRawUnsafe('TRUNCATE TABLE text_chunks;');
  }

  async listChunks(limit: number = 10) {
    return this.prisma.textChunk.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async deleteChunks(ids: string[]) {
    return this.prisma.textChunk.deleteMany({
      where: { id: { in: ids } }
    });
  }

  async deleteChunk(id: string) {
    return this.prisma.textChunk.delete({ where: { id } });
  }

  async getStats() {
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
