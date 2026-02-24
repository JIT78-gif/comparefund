import { supabase } from "@/integrations/supabase/client";

function isTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("Failed to send") ||
    msg.includes("NetworkError") ||
    msg.includes("network") ||
    msg.includes("ERR_") ||
    msg.includes("ECONNREFUSED")
  );
}

function jitteredDelay(baseMs: number): Promise<void> {
  const jitter = Math.random() * baseMs * 0.5;
  return new Promise((r) => setTimeout(r, baseMs + jitter));
}

async function rawInvoke(months: string[], fundType: string, timeoutMs: number) {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT:CLIENT:Request timed out after " + timeoutMs + "ms")), timeoutMs)
  );

  const invoke = supabase.functions.invoke("cvm-statements", {
    body: { months, fundType },
  });

  const { data, error } = await Promise.race([invoke, timeout]) as Awaited<typeof invoke>;
  if (error) throw error;
  return data;
}

/**
 * Read cached statement data directly from the database,
 * bypassing the edge function transport layer entirely.
 */
async function readCacheDirect(
  months: string[],
  fundType: string
): Promise<Record<string, unknown> | null> {
  console.info("[cvm-invoke] Attempting direct DB cache read for", months, fundType);

  const { data: rows, error } = await supabase
    .from("statement_cache")
    .select("ref_month, parsed_payload, expires_at")
    .in("ref_month", months)
    .eq("fund_type", fundType);

  if (error || !rows || rows.length === 0) {
    console.warn("[cvm-invoke] Direct cache read returned nothing", error);
    return null;
  }

  const result: Record<string, unknown> = {};
  const meta: Record<string, string> = {};
  const now = new Date();

  for (const row of rows) {
    result[row.ref_month] = row.parsed_payload;
    const isExpired = new Date(row.expires_at) < now;
    meta[row.ref_month] = isExpired ? "stale" : "cached";
  }

  if (Object.keys(result).length === 0) return null;

  result._meta = meta;
  console.info("[cvm-invoke] Direct cache hit:", Object.keys(meta));
  return result;
}

/**
 * Invoke cvm-statements with:
 * - Deterministic client-side timeout via Promise.race
 * - 1 transport-level retry with jittered delay
 * - Direct DB cache fallback if edge function fails entirely
 */
export async function invokeStatements(
  months: string[],
  fundType: string,
  timeoutMs = 65_000
): Promise<Record<string, unknown>> {
  try {
    return await rawInvoke(months, fundType, timeoutMs);
  } catch (err) {
    // Only retry on transport-level errors
    if (isTransportError(err)) {
      console.warn("[cvm-invoke] Transport error, retrying once after delay…", err);
      await jitteredDelay(1500);
      try {
        return await rawInvoke(months, fundType, timeoutMs);
      } catch (retryErr) {
        console.error("[cvm-invoke] Retry also failed, trying direct DB cache…", retryErr);
      }
    } else {
      console.error("[cvm-invoke] Non-transport error, trying direct DB cache…", err);
    }

    // Fallback: read directly from statement_cache table
    const cached = await readCacheDirect(months, fundType);
    if (cached) return cached;

    // Nothing worked — throw the original error
    throw err;
  }
}

export function classifyError(err: unknown): {
  type: "network" | "timeout" | "unavailable" | "unknown";
  message: string;
} {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("Failed to send") || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("TIMEOUT:CLIENT:")) {
    return {
      type: "network",
      message: "Connection problem — the server may be temporarily unreachable. Please try again in a moment.",
    };
  }
  if (msg.includes("TIMEOUT")) {
    const parts = msg.split(":");
    return {
      type: "timeout",
      message: parts[2] || "Request timed out. Try an earlier month.",
    };
  }
  if (msg.includes("UNAVAILABLE")) {
    const parts = msg.split(":");
    return {
      type: "unavailable",
      message: parts[2] || "Data not available for this month. Try an earlier month.",
    };
  }
  if (msg.includes("All requested months failed")) {
    return {
      type: "unavailable",
      message: "Could not load data for any of the selected months. Please try earlier months.",
    };
  }
  return { type: "unknown", message: msg };
}
