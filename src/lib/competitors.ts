import { apiFetch } from "@/lib/api";

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
  return apiFetch<Competitor[]>("/competitors", {
    method: "POST",
    body: JSON.stringify({ action: "list" }),
  });
}

export async function invokeCompetitorAdmin(action: string, payload: Record<string, unknown> = {}) {
  return apiFetch("/competitors", {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
}
