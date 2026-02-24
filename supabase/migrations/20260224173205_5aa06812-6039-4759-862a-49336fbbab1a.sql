-- Statements cache for monthly parsed CVM payloads
CREATE TABLE IF NOT EXISTS public.statement_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_month TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  parsed_payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  source_status TEXT NOT NULL DEFAULT 'fresh',
  fetch_duration_ms INTEGER,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_statement_cache_month_type
  ON public.statement_cache (ref_month, fund_type);

CREATE INDEX IF NOT EXISTS idx_statement_cache_expires_at
  ON public.statement_cache (expires_at);

ALTER TABLE public.statement_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'statement_cache'
      AND policyname = 'Public read statement cache'
  ) THEN
    CREATE POLICY "Public read statement cache"
      ON public.statement_cache
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'statement_cache'
      AND policyname = 'Service role write statement cache'
  ) THEN
    CREATE POLICY "Service role write statement cache"
      ON public.statement_cache
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'statement_cache'
      AND policyname = 'Service role update statement cache'
  ) THEN
    CREATE POLICY "Service role update statement cache"
      ON public.statement_cache
      FOR UPDATE
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'statement_cache'
      AND policyname = 'Service role delete statement cache'
  ) THEN
    CREATE POLICY "Service role delete statement cache"
      ON public.statement_cache
      FOR DELETE
      USING (auth.role() = 'service_role');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_statement_cache_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_statement_cache_updated_at ON public.statement_cache;
CREATE TRIGGER trg_statement_cache_updated_at
BEFORE UPDATE ON public.statement_cache
FOR EACH ROW
EXECUTE FUNCTION public.set_statement_cache_updated_at();