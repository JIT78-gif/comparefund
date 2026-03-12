import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FNET_LIST_URL =
  "https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados";
const FNET_DOC_URL =
  "https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    const body = await req.json();
    const { competitor_id } = body;

    if (!competitor_id) {
      return new Response(JSON.stringify({ error: "competitor_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active CNPJs for this competitor
    const { data: cnpjs, error: cnpjErr } = await adminClient
      .from("competitor_cnpjs")
      .select("cnpj, fund_name")
      .eq("competitor_id", competitor_id)
      .eq("status", "active");

    if (cnpjErr) throw cnpjErr;
    if (!cnpjs || cnpjs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active CNPJs found for this competitor" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing source_urls to skip duplicates
    const { data: existingDocs } = await adminClient
      .from("regulation_documents")
      .select("source_url")
      .eq("competitor_id", competitor_id)
      .not("source_url", "is", null);

    const existingUrls = new Set((existingDocs || []).map((d) => d.source_url));

    let totalFound = 0;
    let totalNew = 0;
    let totalIngested = 0;
    const errors: string[] = [];

    for (const cnpjRow of cnpjs) {
      const cnpjDigits = cnpjRow.cnpj.replace(/[.\-\/]/g, "");

      try {
        // Query FNET for documents
        const params = new URLSearchParams({
          d: "0",
          s: "0",
          l: "200",
          o: '[{"dataReferencia":"desc"}]',
          cnpjFundo: cnpjDigits,
          idCategoriaDocumento: "0",
          situacao: "A",
        });

        const listRes = await fetch(`${FNET_LIST_URL}?${params}`, {
          headers: { Accept: "application/json" },
        });

        if (!listRes.ok) {
          errors.push(`FNET list failed for ${cnpjDigits}: HTTP ${listRes.status}`);
          await listRes.text();
          continue;
        }

        const listData = await listRes.json();
        const allDocs = listData?.dados || [];

        // Filter for "Regulamento" category
        const regulamentos = allDocs.filter(
          (doc: any) => doc.categoriaDocumento === "Regulamento"
        );

        totalFound += regulamentos.length;

        for (const reg of regulamentos) {
          const docId = reg.id;
          const sourceUrl = `fnet:${docId}`;

          // Skip already ingested
          if (existingUrls.has(sourceUrl)) continue;
          totalNew++;

          try {
            // Fetch document HTML content
            const docRes = await fetch(`${FNET_DOC_URL}?cvm=true&id=${docId}`);
            if (!docRes.ok) {
              errors.push(`Failed to fetch doc ${docId}: HTTP ${docRes.status}`);
              await docRes.text();
              continue;
            }

            let htmlContent = await docRes.text();

            // Strip HTML tags to get plain text
            const textContent = htmlContent
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]*>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\s+/g, " ")
              .trim();

            if (textContent.length < 50) {
              errors.push(`Doc ${docId}: extracted text too short (${textContent.length} chars)`);
              continue;
            }

            // Build title from FNET metadata
            const docTitle =
              reg.descricaoDocumento ||
              reg.categoriaDocumento ||
              `Regulamento ${cnpjRow.fund_name || cnpjDigits}`;
            const fullTitle = `${docTitle} (${reg.dataReferencia || "sem data"})`;

            // Create document record
            const { data: newDoc, error: docInsertErr } = await adminClient
              .from("regulation_documents")
              .insert({
                competitor_id,
                title: fullTitle,
                source_url: sourceUrl,
                status: "processing",
              })
              .select("id")
              .single();

            if (docInsertErr || !newDoc) {
              errors.push(`Failed to insert doc record for ${docId}`);
              continue;
            }

            // Chunk the text
            const chunks = chunkText(textContent, 500, 50);

            // Insert chunks in batches
            const chunkRows = chunks.map((content, index) => ({
              document_id: newDoc.id,
              chunk_index: index,
              content,
            }));

            for (let i = 0; i < chunkRows.length; i += 50) {
              const batch = chunkRows.slice(i, i + 50);
              await adminClient.from("regulation_chunks").insert(batch);
            }

            // Mark as ready
            await adminClient
              .from("regulation_documents")
              .update({ status: "ready", chunk_count: chunks.length })
              .eq("id", newDoc.id);

            existingUrls.add(sourceUrl);
            totalIngested++;
          } catch (docErr) {
            errors.push(`Error processing doc ${docId}: ${docErr instanceof Error ? docErr.message : "unknown"}`);
          }
        }
      } catch (cnpjErr) {
        errors.push(`Error fetching FNET for ${cnpjDigits}: ${cnpjErr instanceof Error ? cnpjErr.message : "unknown"}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_found: totalFound,
        total_new: totalNew,
        total_ingested: totalIngested,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fnet-fetch error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}
