
CREATE TABLE public.google_file_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL UNIQUE REFERENCES public.competitors(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  document_id uuid REFERENCES public.regulation_documents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_file_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access google_file_stores" ON public.google_file_stores
FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read google_file_stores" ON public.google_file_stores
FOR SELECT TO authenticated USING (true);
