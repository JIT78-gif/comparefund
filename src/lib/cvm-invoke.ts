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
 * Invoke cvm-statements with:
 * - Deterministic client-side timeout via Promise.race
 * - 1 transport-level retry with jittered delay
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
        console.error("[cvm-invoke] Retry also failed:", retryErr);
        throw retryErr;
      }
    }
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
