
-- regulation_documents table
CREATE TABLE public.regulation_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- regulation_chunks table
CREATE TABLE public.regulation_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.regulation_documents(id) ON DELETE CASCADE NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- GIN index for full-text search
CREATE INDEX idx_regulation_chunks_search ON public.regulation_chunks USING GIN (search_vector);

-- Enable RLS
ALTER TABLE public.regulation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_chunks ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can SELECT
CREATE POLICY "Authenticated users can read regulation_documents"
  ON public.regulation_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access regulation_documents"
  ON public.regulation_documents FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read regulation_chunks"
  ON public.regulation_chunks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access regulation_chunks"
  ON public.regulation_chunks FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Search function
CREATE OR REPLACE FUNCTION public.search_regulations(
  query_text TEXT,
  competitor_ids UUID[] DEFAULT NULL,
  max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  competitor_id UUID,
  competitor_name TEXT,
  document_title TEXT,
  content TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS chunk_id,
    c.document_id,
    d.competitor_id,
    comp.name AS competitor_name,
    d.title AS document_title,
    c.content,
    ts_rank(c.search_vector, plainto_tsquery('portuguese', query_text)) AS rank
  FROM public.regulation_chunks c
  JOIN public.regulation_documents d ON d.id = c.document_id
  JOIN public.competitors comp ON comp.id = d.competitor_id
  WHERE c.search_vector @@ plainto_tsquery('portuguese', query_text)
    AND (competitor_ids IS NULL OR d.competitor_id = ANY(competitor_ids))
    AND d.status = 'ready'
  ORDER BY rank DESC
  LIMIT max_results;
$$;

-- Storage bucket for regulation PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('regulations', 'regulations', false);

-- Storage RLS: authenticated can read, service_role can write
CREATE POLICY "Authenticated users can read regulations"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'regulations');

CREATE POLICY "Service role can manage regulations"
  ON storage.objects FOR ALL TO public
  USING (bucket_id = 'regulations' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'regulations' AND auth.role() = 'service_role');
