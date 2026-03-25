/*
  Warnings:

  - You are about to drop the `TextChunk` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "TextChunk";

-- CreateTable
CREATE TABLE "text_chunks" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "source" "ChunkSource" NOT NULL DEFAULT 'RAG_KNOWLEDGE',
    "sourceId" TEXT,
    "metadata" JSONB,
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "text_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "text_chunks_source_idx" ON "text_chunks"("source");

-- CreateIndex
CREATE INDEX "text_chunks_sourceId_idx" ON "text_chunks"("sourceId");
