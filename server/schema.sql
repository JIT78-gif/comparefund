-- FIDC Intel Database Schema (Pure PostgreSQL — no Supabase)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles enum and table
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Authorized emails
CREATE TABLE IF NOT EXISTS authorized_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  added_by UUID,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Competitors
CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitor_cnpjs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  cnpj TEXT NOT NULL,
  fund_name TEXT,
  fund_type_override TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Statement cache
CREATE TABLE IF NOT EXISTS statement_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_month TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  parsed_payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  source_status TEXT NOT NULL DEFAULT 'fresh',
  fetch_duration_ms INTEGER,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ref_month, fund_type)
);

-- Regulation documents
CREATE TABLE IF NOT EXISTS regulation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_url TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Regulation chunks
CREATE TABLE IF NOT EXISTS regulation_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES regulation_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding JSONB,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Google file stores
CREATE TABLE IF NOT EXISTS google_file_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  document_id UUID REFERENCES regulation_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(competitor_id)
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_statement_cache_updated ON statement_cache;
CREATE TRIGGER trg_statement_cache_updated BEFORE UPDATE ON statement_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_competitors_updated ON competitors;
CREATE TRIGGER trg_competitors_updated BEFORE UPDATE ON competitors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Search function
CREATE OR REPLACE FUNCTION search_regulations(
  query_text TEXT,
  competitor_ids UUID[] DEFAULT NULL,
  max_results INTEGER DEFAULT 15
) RETURNS TABLE(
  chunk_id UUID, document_id UUID, competitor_id UUID,
  competitor_name TEXT, document_title TEXT, content TEXT, rank REAL
) AS $$
  WITH latest_docs AS (
    SELECT DISTINCT ON (rd.competitor_id) rd.id
    FROM regulation_documents rd
    WHERE rd.status = 'ready'
    ORDER BY rd.competitor_id, rd.created_at DESC
  )
  SELECT
    c.id, c.document_id, d.competitor_id,
    comp.name, d.title, c.content,
    ts_rank(c.search_vector, plainto_tsquery('portuguese', query_text))::REAL AS rank
  FROM regulation_chunks c
  JOIN regulation_documents d ON d.id = c.document_id
  JOIN competitors comp ON comp.id = d.competitor_id
  JOIN latest_docs ld ON ld.id = d.id
  WHERE c.search_vector @@ plainto_tsquery('portuguese', query_text)
    AND (competitor_ids IS NULL OR d.competitor_id = ANY(competitor_ids))
  ORDER BY rank DESC
  LIMIT max_results;
$$ LANGUAGE SQL STABLE;

-- Seed: create initial admin user (password: admin123 — change in production!)
-- INSERT INTO users (id, email, password_hash) VALUES (
--   gen_random_uuid(), 'jitguard76@gmail.com',
--   '$2a$10$...' -- bcrypt hash of your password
-- );
-- INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = 'jitguard76@gmail.com';
