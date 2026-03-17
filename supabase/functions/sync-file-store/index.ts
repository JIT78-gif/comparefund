import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request - optionally sync a specific competitor
    const body = await req.json().catch(() => ({}));
    const targetCompetitorId = body.competitor_id || null;

    // Get latest ready document per competitor
    let query = adminClient
      .from("regulation_documents")
      .select("id, competitor_id, title, competitors(name)")
      .eq("status", "ready")
      .order("created_at", { ascending: false });

    if (targetCompetitorId) {
      query = query.eq("competitor_id", targetCompetitorId);
    }

    const { data: docs, error: docsErr } = await query;
    if (docsErr) throw docsErr;

    // Keep only latest doc per competitor
    const latestByCompetitor = new Map<string, typeof docs[0]>();
    for (const doc of docs || []) {
      if (!latestByCompetitor.has(doc.competitor_id)) {
        latestByCompetitor.set(doc.competitor_id, doc);
      }
    }

    const results: { competitor_id: string; store_name: string; status: string }[] = [];

    for (const [competitorId, doc] of latestByCompetitor) {
      try {
        // Get all chunks for this document
        const { data: chunks } = await adminClient
          .from("regulation_chunks")
          .select("content, chunk_index")
          .eq("document_id", doc.id)
          .order("chunk_index", { ascending: true });

        if (!chunks || chunks.length === 0) {
          results.push({ competitor_id: competitorId, store_name: "", status: "no_chunks" });
          continue;
        }

        const fullText = chunks.map((c) => c.content).join("\n\n");
        const competitorName = (doc as any).competitors?.name || "Unknown";

        // Check if we already have a store for this competitor
        const { data: existing } = await adminClient
          .from("google_file_stores")
          .select("store_name, document_id")
          .eq("competitor_id", competitorId)
          .maybeSingle();

        let storeName: string;

        if (existing?.store_name) {
          storeName = existing.store_name;
          // Delete old documents from the store
          try {
            const listRes = await fetch(
              `${GEMINI_BASE}/v1beta/${storeName}/documents?key=${geminiKey}`
            );
            if (listRes.ok) {
              const listData = await listRes.json();
              for (const d of listData.fileSearchStoreDocuments || []) {
                await fetch(
                  `${GEMINI_BASE}/v1beta/${d.name}?key=${geminiKey}`,
                  { method: "DELETE" }
                );
              }
            }
          } catch (e) {
            console.error("Error cleaning old docs:", e);
            // If store is gone, create a new one
            storeName = await createStore(geminiKey, competitorName);
          }
        } else {
          storeName = await createStore(geminiKey, competitorName);
        }

        // Upload text content to the store
        await uploadToStore(geminiKey, storeName, fullText, `${competitorName} - ${doc.title}`);

        // Upsert the store record
        await adminClient
          .from("google_file_stores")
          .upsert(
            {
              competitor_id: competitorId,
              store_name: storeName,
              document_id: doc.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "competitor_id" }
          );

        results.push({ competitor_id: competitorId, store_name: storeName, status: "synced" });
      } catch (e) {
        console.error(`Sync failed for competitor ${competitorId}:`, e);
        results.push({
          competitor_id: competitorId,
          store_name: "",
          status: `error: ${e instanceof Error ? e.message : "unknown"}`,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-file-store error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createStore(apiKey: string, displayName: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/v1beta/fileSearchStores?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create store: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.name; // e.g. "fileSearchStores/abc123"
}

async function uploadToStore(
  apiKey: string,
  storeName: string,
  textContent: string,
  displayName: string
): Promise<void> {
  const boundary = "----boundary" + Date.now();
  const metadata = JSON.stringify({
    file: { displayName: displayName.slice(0, 200) + ".txt" },
  });

  const encoder = new TextEncoder();
  const parts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${textContent}\r\n`,
    `--${boundary}--\r\n`,
  ];
  const body = encoder.encode(parts.join(""));

  const res = await fetch(
    `${GEMINI_BASE}/upload/v1beta/${storeName}:uploadToFileSearchStore?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed: ${res.status} ${err}`);
  }

  const operation = await res.json();

  // Poll until operation is done (max 120s)
  if (operation.name && !operation.done) {
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(
        `${GEMINI_BASE}/v1beta/${operation.name}?key=${apiKey}`
      );
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        if (pollData.done) return;
      }
    }
    console.warn("Upload operation did not complete within timeout");
  }
}
