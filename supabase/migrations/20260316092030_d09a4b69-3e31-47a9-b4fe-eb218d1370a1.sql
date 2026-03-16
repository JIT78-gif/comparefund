CREATE OR REPLACE FUNCTION public.search_regulations(
  query_text text,
  query_embedding_arr double precision[] DEFAULT NULL,
  competitor_ids uuid[] DEFAULT NULL,
  max_results integer DEFAULT 15
)
RETURNS TABLE(
  chunk_id uuid,
  document_id uuid,
  competitor_id uuid,
  competitor_name text,
  document_title text,
  content text,
  rank real
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH latest_docs AS (
    SELECT DISTINCT ON (rd.competitor_id) rd.id
    FROM public.regulation_documents rd
    WHERE rd.status = 'ready'
    ORDER BY rd.competitor_id, rd.created_at DESC
  )
  SELECT
    c.id AS chunk_id,
    c.document_id,
    d.competitor_id,
    comp.name AS competitor_name,
    d.title AS document_title,
    c.content,
    ts_rank(c.search_vector, plainto_tsquery('portuguese', query_text))::real AS rank
  FROM public.regulation_chunks c
  JOIN public.regulation_documents d ON d.id = c.document_id
  JOIN public.competitors comp ON comp.id = d.competitor_id
  JOIN latest_docs ld ON ld.id = d.id
  WHERE c.search_vector @@ plainto_tsquery('portuguese', query_text)
    AND (competitor_ids IS NULL OR d.competitor_id = ANY(competitor_ids))
  ORDER BY rank DESC
  LIMIT max_results;
$$;