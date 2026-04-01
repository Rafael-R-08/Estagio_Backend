-- Fix for pgvector: ensuring dimensions are set before creating IVFFLAT indices
-- Xenova/all-MiniLM-L6-v2 uses 384 dimensions

-- 1. Update Course table to have explicit 384 dimensions
ALTER TABLE "Course" ALTER COLUMN "embedding" TYPE vector(384);

-- 2. Update TextChunk table to have explicit 384 dimensions
-- Note: A previous migration might have set it to 1536, so we force 384 here for Xenova
ALTER TABLE "text_chunks" ALTER COLUMN "embedding" TYPE vector(384);

-- 3. Create IVFFLAT index for RAG and search knowledge
CREATE INDEX IF NOT EXISTS text_chunks_embedding_ivfflat_idx ON "text_chunks" 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. Create IVFFLAT index for Course table
CREATE INDEX IF NOT EXISTS courses_embedding_ivfflat_idx ON "Course" 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
