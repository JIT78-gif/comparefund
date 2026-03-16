
DROP FUNCTION IF EXISTS public.search_regulations(text, uuid[], integer);

CREATE FUNCTION public.search_regulations(
  query_text text, 
  query_embedding_arr float8[] DEFAULT NULL,
  competitor_ids uuid[] DEFAULT NULL::uuid[], 
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  qe vector;
BEGIN
  IF query_embedding_arr IS NOT NULL THEN
    qe := query_embedding_arr::vector;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    d.competitor_id,
    comp.name AS competitor_name,
    d.title AS document_title,
    c.content,
    CASE 
      WHEN qe IS NOT NULL AND c.embedding IS NOT NULL THEN
        (0.4 * ts_rank(c.search_vector, plainto_tsquery('portuguese', query_text)) + 
         0.6 * (1.0 - (c.embedding <=> qe)::real))
      ELSE
        ts_rank(c.search_vector, plainto_tsquery('portuguese', query_text))
    END AS rank
  FROM public.regulation_chunks c
  JOIN public.regulation_documents d ON d.id = c.document_id
  JOIN public.competitors comp ON comp.id = d.competitor_id
  WHERE (
    c.search_vector @@ plainto_tsquery('portuguese', query_text)
    OR (qe IS NOT NULL AND c.embedding IS NOT NULL AND (c.embedding <=> qe) < 0.8)
  )
    AND (competitor_ids IS NULL OR d.competitor_id = ANY(competitor_ids))
    AND d.status = 'ready'
  ORDER BY rank DESC
  LIMIT max_results;
END;
$$;
