
-- Create competitors table
CREATE TABLE public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create competitor_cnpjs table
CREATE TABLE public.competitor_cnpjs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  cnpj text NOT NULL UNIQUE,
  fund_name text,
  fund_type_override text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_cnpjs ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read competitors" ON public.competitors FOR SELECT USING (true);
CREATE POLICY "Public read competitor_cnpjs" ON public.competitor_cnpjs FOR SELECT USING (true);

-- Service role write access
CREATE POLICY "Service role insert competitors" ON public.competitors FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role update competitors" ON public.competitors FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role delete competitors" ON public.competitors FOR DELETE USING (auth.role() = 'service_role');

CREATE POLICY "Service role insert competitor_cnpjs" ON public.competitor_cnpjs FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role update competitor_cnpjs" ON public.competitor_cnpjs FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role delete competitor_cnpjs" ON public.competitor_cnpjs FOR DELETE USING (auth.role() = 'service_role');

-- Auto-update updated_at trigger for competitors
CREATE OR REPLACE FUNCTION public.set_competitors_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_competitors_updated_at
  BEFORE UPDATE ON public.competitors
  FOR EACH ROW EXECUTE FUNCTION public.set_competitors_updated_at();
