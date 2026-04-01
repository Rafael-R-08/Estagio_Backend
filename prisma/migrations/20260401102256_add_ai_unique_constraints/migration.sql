/*
  Warnings:

  - A unique constraint covering the columns `[externalId,platformId]` on the table `Course` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[source,sourceId]` on the table `text_chunks` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "courses_embedding_ivfflat_idx";

-- DropIndex
DROP INDEX IF EXISTS "text_chunks_embedding_ivfflat_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Course_externalId_platformId_key" ON "Course"("externalId", "platformId");

-- CreateIndex
CREATE UNIQUE INDEX "text_chunks_source_sourceId_key" ON "text_chunks"("source", "sourceId");
