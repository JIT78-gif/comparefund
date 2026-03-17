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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify auth
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

    // Fetch file search store names
    const adminClient = createClient(supabaseUrl, serviceKey);
    let storeQuery = adminClient.from("google_file_stores").select("store_name, competitor_id");
    if (competitor_ids?.length) {
      storeQuery = storeQuery.in("competitor_id", competitor_ids);
    }
    const { data: stores } = await storeQuery;
    const storeNames = (stores || []).map((s) => s.store_name).filter(Boolean);

    if (storeNames.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum regulamento sincronizado. Peça ao administrador para sincronizar os documentos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Gemini contents from messages
    const geminiContents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const systemInstruction = {
      parts: [
        {
          text: `Você é um especialista em regulamentos de FIDCs (Fundos de Investimento em Direitos Creditórios).
Responda SOMENTE com base nos documentos fornecidos via File Search. NÃO use conhecimento externo.
Se a informação não estiver nos documentos, diga claramente que não encontrou nos regulamentos disponíveis.
Quando houver trechos de múltiplos concorrentes, compare as regras e destaque diferenças.
Responda no idioma da pergunta do usuário (português ou inglês).
Use markdown para formatação (negrito, listas, títulos).
Cite as fontes quando possível, referenciando os nomes dos documentos.`,
        },
      ],
    };

    // Call Gemini with File Search tool and streaming
    const geminiRes = await fetch(
      `${GEMINI_BASE}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          systemInstruction,
          tools: [
            {
              file_search: {
                file_search_store_names: storeNames,
              },
            },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transform Gemini SSE to OpenAI-compatible SSE format (frontend expects this)
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            continue;
          }

          try {
            const geminiData = JSON.parse(jsonStr);
            const parts = geminiData.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  const openaiChunk = {
                    choices: [{ delta: { content: part.text } }],
                  };
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify(openaiChunk)}\n\n`)
                  );
                }
              }
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
    });

    const stream = geminiRes.body!.pipeThrough(transformStream);

    return new Response(stream, {
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
