-- CreateEnum
CREATE TYPE "ChunkSource" AS ENUM ('EXTERNAL_COURSE', 'SOFTINSA_LEARNING', 'COURSE_ANALYSIS', 'RAG_KNOWLEDGE');

-- AlterTable
ALTER TABLE "TextChunk" ADD COLUMN     "lastUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "source" "ChunkSource" NOT NULL DEFAULT 'RAG_KNOWLEDGE',
ADD COLUMN     "sourceId" TEXT;

-- CreateTable
CREATE TABLE "RecommendationFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recommendationText" TEXT NOT NULL,
    "rating" INTEGER,
    "courseClicked" BOOLEAN NOT NULL DEFAULT false,
    "courseEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationFeedback_userId_idx" ON "RecommendationFeedback"("userId");

-- CreateIndex
CREATE INDEX "TextChunk_sourceId_idx" ON "TextChunk"("sourceId");
