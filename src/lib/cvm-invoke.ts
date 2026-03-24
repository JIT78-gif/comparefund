import { apiFetch } from "@/lib/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function isTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("Failed to fetch") || msg.includes("Failed to send") || msg.includes("NetworkError") || msg.includes("network") || msg.includes("ERR_") || msg.includes("ECONNREFUSED");
}

function jitteredDelay(baseMs: number): Promise<void> {
  const jitter = Math.random() * baseMs * 0.5;
  return new Promise((r) => setTimeout(r, baseMs + jitter));
}

async function rawInvoke(months: string[], fundType: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/api/statements`, {
      method: "POST",
      headers,
      body: JSON.stringify({ months, fundType }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("TIMEOUT:CLIENT:Request timed out after " + timeoutMs + "ms");
    throw e;
  }
}

async function readCacheDirect(months: string[], fundType: string): Promise<Record<string, unknown> | null> {
  // Direct cache read is only possible with Supabase client; skip in pure PG mode
  return null;
}

export async function invokeStatements(months: string[], fundType: string, timeoutMs = 65_000): Promise<Record<string, unknown>> {
  try {
    return await rawInvoke(months, fundType, timeoutMs);
  } catch (err) {
    if (isTransportError(err)) {
      console.warn("[cvm-invoke] Transport error, retrying once…", err);
      await jitteredDelay(1500);
      try {
        return await rawInvoke(months, fundType, timeoutMs);
      } catch (retryErr) {
        console.error("[cvm-invoke] Retry also failed", retryErr);
      }
    }
    throw err;
  }
}

export function classifyError(err: unknown): { type: "network" | "timeout" | "unavailable" | "unknown"; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Failed to send") || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("TIMEOUT:CLIENT:")) {
    return { type: "network", message: "Connection problem — the server may be temporarily unreachable." };
  }
  if (msg.includes("TIMEOUT")) {
    const parts = msg.split(":");
    return { type: "timeout", message: parts[2] || "Request timed out." };
  }
  if (msg.includes("UNAVAILABLE")) {
    const parts = msg.split(":");
    return { type: "unavailable", message: parts[2] || "Data not available." };
  }
  if (msg.includes("All requested months failed")) {
    return { type: "unavailable", message: "Could not load data for any of the selected months." };
  }
  return { type: "unknown", message: msg };
}
