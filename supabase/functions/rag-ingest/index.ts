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
    // Verify admin
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

    // Verify the user is admin
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

    // Check admin role
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
      // PDF file upload
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

      // Store PDF in storage
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

      // Extract text from PDF - basic extraction
      const arrayBuffer = await file.arrayBuffer();
      textContent = extractTextFromPdf(new Uint8Array(arrayBuffer));
      sourceUrl = filePath;
    } else {
      // JSON body with URL or raw text
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
        // Fetch URL content
        const res = await fetch(body.source_url);
        textContent = await res.text();
        // Strip HTML tags if present
        textContent = textContent.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      } else {
        return new Response(JSON.stringify({ error: "text_content or source_url required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!textContent || textContent.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Extracted text is too short. PDF may be image-based or empty." }), {
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

    // Chunk the text
    const chunks = chunkText(textContent, 500, 50);

    // Insert chunks
    const chunkRows = chunks.map((content, index) => ({
      document_id: doc.id,
      chunk_index: index,
      content,
    }));

    // Insert in batches of 50
    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error: chunkErr } = await adminClient
        .from("regulation_chunks")
        .insert(batch);
      if (chunkErr) {
        console.error("Chunk insert error:", chunkErr);
      }
    }

    // Update document status
    await adminClient
      .from("regulation_documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", doc.id);

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
 * Basic PDF text extraction — handles text-based PDFs by finding text streams.
 * For image-based PDFs, this will return empty/minimal text.
 */
function extractTextFromPdf(bytes: Uint8Array): string {
  // Convert to string to find text content
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  const textParts: string[] = [];

  // Extract text between BT...ET (text objects in PDF)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Find text show operators: Tj, TJ, ', "
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textParts.push(tjMatch[1]);
    }
    // TJ array
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let arrMatch;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = arrMatch[1];
      const strRegex = /\(([^)]*)\)/g;
      let strMatch;
      while ((strMatch = strRegex.exec(inner)) !== null) {
        textParts.push(strMatch[1]);
      }
    }
  }

  return textParts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Split text into overlapping chunks of approximately `chunkSize` words
 * with `overlap` word overlap between consecutive chunks.
 */
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
