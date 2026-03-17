import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText } from "https://esm.sh/unpdf@0.12.1";

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

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

    const contentType = req.headers.get("content-type") || "";

    let competitorId: string;
    let title: string;
    let sourceUrl: string | null = null;
    let textContent: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      competitorId = formData.get("competitor_id") as string;
      title = formData.get("title") as string;
      const file = formData.get("file") as File;

      if (!competitorId || !title || !file) {
        return new Response(JSON.stringify({ error: "competitor_id, title, and file are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const filePath = `${competitorId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await adminClient.storage
        .from("regulations")
        .upload(filePath, file, { contentType: file.type });

      if (uploadErr) {
        console.error("Upload error:", uploadErr);
        return new Response(JSON.stringify({ error: "Failed to upload file" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const arrayBuffer = await file.arrayBuffer();
      textContent = await extractPdfText(new Uint8Array(arrayBuffer));
      sourceUrl = filePath;
    } else {
      const body = await req.json();
      competitorId = body.competitor_id;
      title = body.title;
      sourceUrl = body.source_url || null;

      if (!competitorId || !title) {
        return new Response(JSON.stringify({ error: "competitor_id and title are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (body.text_content) {
        textContent = body.text_content;
      } else if (body.source_url) {
        const res = await fetch(body.source_url);
        textContent = await res.text();
        textContent = textContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      } else {
        return new Response(JSON.stringify({ error: "text_content or source_url required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!textContent || textContent.trim().length < 50) {
      return new Response(JSON.stringify({ error: "PDF appears to be image-based or empty. Please use a text-based PDF or paste the text manually." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create document record
    const { data: doc, error: docErr } = await adminClient
      .from("regulation_documents")
      .insert({
        competitor_id: competitorId,
        title,
        source_url: sourceUrl,
        file_path: sourceUrl,
        status: "processing",
      })
      .select("id")
      .single();

    if (docErr || !doc) {
      console.error("Doc insert error:", docErr);
      return new Response(JSON.stringify({ error: "Failed to create document record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chunk with paragraph-aware splitting
    const chunks = chunkTextByParagraph(textContent, 400, 1);

    // Generate embeddings for chunks if API key is available
    const embeddings: (number[] | null)[] = [];
    if (lovableApiKey) {
      for (let i = 0; i < chunks.length; i += 20) {
        const batch = chunks.slice(i, i + 20);
        const batchEmbeddings = await generateEmbeddings(batch, lovableApiKey);
        embeddings.push(...batchEmbeddings);
      }
    } else {
      chunks.forEach(() => embeddings.push(null));
    }

    // Insert chunks with embeddings
    const chunkRows = chunks.map((content, index) => ({
      document_id: doc.id,
      chunk_index: index,
      content,
      ...(embeddings[index] ? { embedding: JSON.stringify(embeddings[index]) } : {}),
    }));

    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error: chunkErr } = await adminClient
        .from("regulation_chunks")
        .insert(batch);
      if (chunkErr) {
        console.error("Chunk insert error:", chunkErr);
      }
    }

    await adminClient
      .from("regulation_documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", doc.id);

    // Trigger Google File Search sync for this competitor
    try {
      const syncUrl = `${supabaseUrl}/functions/v1/sync-file-store`;
      await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          apikey: anonKey,
        },
        body: JSON.stringify({ competitor_id: competitorId }),
      });
    } catch (syncErr) {
      console.error("File search sync trigger failed (non-blocking):", syncErr);
    }

    return new Response(
      JSON.stringify({ success: true, document_id: doc.id, chunk_count: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("rag-ingest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Extract text from PDF using unpdf library.
 * Falls back to empty string on failure.
 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const result = await extractText(bytes.buffer);
    const text = (result.text || "").replace(/\s+/g, " ").trim();
    return text;
  } catch (e) {
    console.error("unpdf extractText failed:", e);
    return "";
  }
}

/**
 * Paragraph-aware chunking: splits on double newlines first,
 * then groups paragraphs until ~targetWords, with 1-paragraph overlap.
 */
function chunkTextByParagraph(text: string, targetWords: number, overlapParagraphs: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  
  if (paragraphs.length === 0) return [text];
  
  const chunks: string[] = [];
  let currentParagraphs: string[] = [];
  let currentWordCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paraWords = paragraphs[i].split(/\s+/).length;
    
    if (currentWordCount + paraWords > targetWords && currentParagraphs.length > 0) {
      chunks.push(currentParagraphs.join("\n\n"));
      // Keep last N paragraphs for overlap
      const overlapStart = Math.max(0, currentParagraphs.length - overlapParagraphs);
      const kept = currentParagraphs.slice(overlapStart);
      currentParagraphs = [...kept];
      currentWordCount = kept.reduce((sum, p) => sum + p.split(/\s+/).length, 0);
    }
    
    currentParagraphs.push(paragraphs[i]);
    currentWordCount += paraWords;
  }

  if (currentParagraphs.length > 0) {
    chunks.push(currentParagraphs.join("\n\n"));
  }

  // Fallback: if no paragraph breaks found, use word-based chunking
  if (chunks.length <= 1 && text.split(/\s+/).length > targetWords) {
    return chunkTextByWords(text, targetWords, 50);
  }

  return chunks;
}

/** Word-based fallback chunker */
function chunkTextByWords(text: string, chunkSize: number, overlap: number): string[] {
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

/**
 * Generate embeddings via Lovable AI gateway.
 * Uses google/gemini text embedding. Falls back to null on failure.
 */
async function generateEmbeddings(texts: string[], apiKey: string): Promise<(number[] | null)[]> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
        dimensions: 768,
      }),
    });

    if (!response.ok) {
      console.error("Embedding API error:", response.status, await response.text());
      return texts.map(() => null);
    }

    const data = await response.json();
    if (data.data && Array.isArray(data.data)) {
      return data.data.map((item: { embedding: number[] }) => item.embedding);
    }
    return texts.map(() => null);
  } catch (e) {
    console.error("Embedding generation failed:", e);
    return texts.map(() => null);
  }
}
