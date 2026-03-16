import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { messages, competitor_ids } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build conversation-aware search query from last 3 messages
    const recentMessages = messages.slice(-3);
    const searchQuery = recentMessages
      .map((m: { content: string }) => m.content)
      .join(" ")
      .slice(0, 500);

    if (!searchQuery.trim()) {
      return new Response(JSON.stringify({ error: "No search content found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate query embedding for semantic search
    let queryEmbedding: number[] | null = null;
    try {
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
      if (lastUserMsg) {
        const embResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: lastUserMsg.content,
            dimensions: 768,
          }),
        });

        if (embResponse.ok) {
          const embData = await embResponse.json();
          queryEmbedding = embData.data?.[0]?.embedding || null;
        }
      }
    } catch (e) {
      console.error("Query embedding failed (continuing with text search):", e);
    }

    // Search regulation chunks using service role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const searchPromise = adminClient.rpc("search_regulations", {
      query_text: searchQuery,
      query_embedding_arr: queryEmbedding,
      competitor_ids: competitor_ids?.length ? competitor_ids : null,
      max_results: 15,
    });

    const readyDocsCountQuery = competitor_ids?.length
      ? adminClient
          .from("regulation_documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "ready")
          .in("competitor_id", competitor_ids)
      : adminClient
          .from("regulation_documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "ready");

    const [{ data: searchResults, error: searchErr }, { count: readyDocumentCount, error: countErr }] = await Promise.all([
      searchPromise,
      readyDocsCountQuery,
    ]);

    if (searchErr) {
      console.error("Search error:", searchErr);
    }

    if (countErr) {
      console.error("Document count error:", countErr);
    }

    const hasReadyDocuments = (readyDocumentCount ?? 0) > 0;

    // Build context from search results
    let context = "";
    if (searchResults && searchResults.length > 0) {
      context = searchResults
        .map(
          (r: { competitor_name: string; document_title: string; content: string }, i: number) =>
            `[${i + 1}] Fonte: ${r.competitor_name} — "${r.document_title}"\n${r.content}`
        )
        .join("\n\n---\n\n");
    }

    const noContextInstruction = hasReadyDocuments
      ? "⚠️ Existem regulamentos prontos na base, mas nenhum trecho relevante foi encontrado para esta pergunta. Responda de forma útil: cumprimente se for uma saudação, peça uma pergunta mais específica se necessário e jamais diga que a base está vazia."
      : "⚠️ Ainda não há regulamentos prontos na base. Responda que não há regulamentos ingeridos ainda e sugira ao administrador fazer o upload.";

    const systemPrompt = `Você é um especialista em regulamentos de FIDCs (Fundos de Investimento em Direitos Creditórios). 
Responda com base nos trechos de regulamentos fornecidos abaixo como contexto.
Quando houver trechos de múltiplos concorrentes, compare as regras e destaque diferenças.
Se não encontrar informação relevante no contexto, diga isso claramente.
Responda no idioma da pergunta do usuário (português ou inglês).
Use markdown para formatação (negrito, listas, títulos).
**IMPORTANTE**: Cite as fontes usando a notação [N] ao longo da resposta, referenciando os trechos do contexto. Por exemplo: "Conforme [2], o prazo de resgate é D+30."

${context ? `## Contexto dos Regulamentos\n\n${context}` : noContextInstruction}`;

    // Call Lovable AI gateway with streaming
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("rag-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function competitorsFallbackIds(
  messages: Array<{ content?: string }>,
  competitorIds?: string[] | null,
): string[] {
  return competitorIds?.length ? competitorIds : [];
}
