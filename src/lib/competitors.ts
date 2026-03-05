import { supabase } from "@/integrations/supabase/client";

export interface CompetitorCnpj {
  id: string;
  competitor_id: string;
  cnpj: string;
  fund_name: string | null;
  fund_type_override: string | null;
  status: string;
  created_at: string;
}

export interface Competitor {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  updated_at: string;
  competitor_cnpjs: CompetitorCnpj[];
}

export async function fetchCompetitors(): Promise<Competitor[]> {
  const { data, error } = await supabase
    .from("competitors")
    .select("*, competitor_cnpjs(*)")
    .order("name");
  if (error) throw error;
  return (data as unknown as Competitor[]) || [];
}

export async function invokeCompetitorAdmin(action: string, payload: Record<string, unknown> = {}) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  
  // Get the current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  }

  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/competitor-admin`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...payload }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
