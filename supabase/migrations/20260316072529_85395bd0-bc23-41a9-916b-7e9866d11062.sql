
ALTER TABLE public.regulation_chunks ADD COLUMN IF NOT EXISTS embedding extensions.vector(768);

CREATE INDEX IF NOT EXISTS regulation_chunks_embedding_idx 
ON public.regulation_chunks USING hnsw (embedding extensions.vector_cosine_ops);
