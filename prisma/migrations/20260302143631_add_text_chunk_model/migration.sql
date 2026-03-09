-- CreateTable
CREATE TABLE "TextChunk" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TextChunk_createdAt_idx" ON "TextChunk"("createdAt");
