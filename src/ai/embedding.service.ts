import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';

export interface SearchResult {
  id: string;
  content: string;
  metadata?: any;
  similarity: number;
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
   * Indexa um chunk de texto gerando e armazenando seu embedding
   */
  async indexChunk(content: string, metadata?: Record<string, any>) {
    this.logger.log(`Indexando chunk de texto: ${content.substring(0, 50)}...`);

    try {
      // Gera embedding usando GitHub Models
      const embedding = await this.aiService.embed(content);
      const embeddingStr = `[${embedding.join(',')}]`;
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      // Armazena no banco usando raw SQL para suportar o tipo vector do pgvector
      const result = await this.prisma.$queryRaw<
        Array<{ id: string; content: string; metadata: any; createdAt: Date }>
      >`
        INSERT INTO "TextChunk" (id, content, embedding, metadata, "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${content},
          ${embeddingStr}::vector,
          ${metadataJson}::jsonb,
          NOW(),
          NOW()
        )
        RETURNING id, content, metadata, "createdAt"
      `;

      const chunk = result[0];
      this.logger.log(`Chunk indexado com sucesso: ${chunk.id}`);
      return chunk;
    } catch (error) {
      this.logger.error(`Erro ao indexar chunk: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Pesquisa chunks similares usando busca por similaridade de cosseno
   */
  async searchChunks(query: string, limit: number = 5): Promise<SearchResult[]> {
    this.logger.log(`Pesquisando chunks similares a: "${query}"`);

    try {
      // Gera embedding da query e converte para string no formato vector
      const queryEmbedding = await this.aiService.embed(query);
      const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;

      // Busca por similaridade usando pgvector
      // Usa o operador <=> (distância de cosseno) do pgvector
      const results = await this.prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          metadata: any;
          createdAt: Date;
          distance: number;
        }>
      >`
        SELECT 
          id,
          content,
          metadata,
          "createdAt",
          (embedding <=> ${queryEmbeddingStr}::vector) as distance
        FROM "TextChunk"
        ORDER BY embedding <=> ${queryEmbeddingStr}::vector
        LIMIT ${limit}
      `;

      // Converter distância em similaridade (1 - distância)
      const searchResults: SearchResult[] = results.map((row) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        similarity: 1 - row.distance,
        createdAt: row.createdAt,
      }));

      this.logger.log(`Encontrados ${searchResults.length} resultados`);
      return searchResults;
    } catch (error) {
      this.logger.error(`Erro ao pesquisar chunks: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Lista todos os chunks indexados
   */
  async listChunks(limit: number = 10) {
    return this.prisma.$queryRaw<
      Array<{ id: string; content: string; metadata: any; createdAt: Date }>
    >`
      SELECT id, content, metadata, "createdAt"
      FROM "TextChunk"
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Deleta todos os chunks (útil para testes)
   */
  async deleteAllChunks() {
    const result = await this.prisma.textChunk.deleteMany();
    this.logger.log(`Deletados ${result.count} chunks`);
    return { deleted: result.count };
  }

  /**
   * Deleta um chunk específico
   */
  async deleteChunk(id: string) {
    await this.prisma.textChunk.delete({ where: { id } });
    this.logger.log(`Chunk deletado: ${id}`);
    return { deleted: true };
  }
}
