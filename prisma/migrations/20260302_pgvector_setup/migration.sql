-- 1) Ativar extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Tabela para chunks de cursos (pesquisa semântica sobre catálogos/descrições)
CREATE TABLE IF NOT EXISTS course_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID,                     -- opcional se tiveres tabela "Course" no Prisma
  source          TEXT NOT NULL,            -- ex.: 'udemy' | 'microsoft-learn' | 'trailhead' | 'internal'
  url             TEXT,                     -- link original do curso
  title           TEXT,
  content         TEXT NOT NULL,            -- texto do chunk (até ~2-4k chars)
  embedding       vector(1536),             -- vetor d=1536 (nomic-embed-text)
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Índice de similaridade (IVFFlat) para acelerar KNN
--    Nota: requer ANALYZE e listas configuradas consoante o volume.
CREATE INDEX IF NOT EXISTS idx_course_chunks_embedding_ivfflat
  ON course_chunks
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

-- 4) Índices úteis
CREATE INDEX IF NOT EXISTS idx_course_chunks_source ON course_chunks (source);
CREATE INDEX IF NOT EXISTS idx_course_chunks_created_at ON course_chunks (created_at);

-- 5) (Opcional) Tabela para chunks de documentos (certificados/evidências)
CREATE TABLE IF NOT EXISTS document_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID,                     -- referência ao documento original
  source          TEXT NOT NULL,            -- 'pdf' | 'image-ocr' | 'manual'
  title           TEXT,
  content         TEXT NOT NULL,
  embedding       vector(1536),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_ivfflat
  ON document_chunks
  USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_document_chunks_created_at ON document_chunks (created_at);
