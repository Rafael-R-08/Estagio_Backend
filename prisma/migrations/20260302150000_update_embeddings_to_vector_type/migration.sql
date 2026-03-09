-- Ensure pgvector extension is installed
CREATE EXTENSION IF NOT EXISTS vector;

-- Alter TextChunk table to use proper vector type
-- First, we need to drop the old column and create a new one with vector type
ALTER TABLE "TextChunk" 
DROP COLUMN IF EXISTS embedding;

ALTER TABLE "TextChunk"
ADD COLUMN embedding vector(768);

-- Create index for faster similarity search on TextChunk
CREATE INDEX IF NOT EXISTS idx_text_chunk_embedding_ivfflat
  ON "TextChunk"
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

-- Alter Course table to use proper vector type
ALTER TABLE "Course"
DROP COLUMN IF EXISTS embedding;

ALTER TABLE "Course"
ADD COLUMN embedding vector(768);

-- Create index for faster similarity search on Course
CREATE INDEX IF NOT EXISTS idx_course_embedding_ivfflat
  ON "Course"
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);
