import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText } from "https://esm.sh/unpdf@0.12.1";
import { corsHeaders } from "../_shared/cors.ts";

const FNET_LIST_URL =
  "https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados";
const FNET_DOC_URL =
  "https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento";

const DEFAULT_MAX_DOCS_PER_CNPJ = 3;
const DEFAULT_MAX_TOTAL_DOCS = 10;
const DEFAULT_LIST_PAGE_SIZE = 40;
const EXECUTION_BUDGET_MS = 50000;
const MIN_REMAINING_FOR_FETCH_MS = 2000;
const MIN_REMAINING_FOR_DOC_MS = 8000;
const FETCH_TIMEOUT_MS = 10000;
const LIST_FETCH_TIMEOUT_MS = 8000;
const MAX_LIST_FETCH_RETRIES = 2;
const DOC_FETCH_MAX_RETRIES = 2;
const MAX_CHUNKS_PER_DOC = 300;

type FnetDoc = {
  id: number | string;
  categoriaDocumento?: string;
  descricaoDocumento?: string;
  dataReferencia?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await safeJson(req);
    const competitorId = typeof body?.competitor_id === "string" ? body.competitor_id : null;

    if (!competitorId) {
      return jsonResponse({ error: "competitor_id is required" }, 400);
    }

    const maxDocsPerCnpj = normalizeLimit(body?.max_docs_per_cnpj, DEFAULT_MAX_DOCS_PER_CNPJ, 1, 30);
    const maxTotalDocs = normalizeLimit(body?.max_total_docs, DEFAULT_MAX_TOTAL_DOCS, 1, 60);

    const { data: cnpjs, error: cnpjErr } = await adminClient
      .from("competitor_cnpjs")
      .select("cnpj, fund_name")
      .eq("competitor_id", competitorId)
      .eq("status", "active");

    if (cnpjErr) throw cnpjErr;

    if (!cnpjs || cnpjs.length === 0) {
      return jsonResponse({
        success: true,
        total_found: 0,
        total_new: 0,
        total_ingested: 0,
        stopped_early: false,
        errors: ["No active CNPJs found for this competitor"],
      });
    }

    const { data: existingDocs } = await adminClient
      .from("regulation_documents")
      .select("source_url")
      .eq("competitor_id", competitorId)
      .not("source_url", "is", null);

    const existingUrls = new Set((existingDocs || []).map((d) => d.source_url));

    const startedAt = Date.now();

    let totalFound = 0;
    let totalNew = 0;
    let totalIngested = 0;
    let stoppedEarly = false;
    const errors: string[] = [];

    for (const cnpjRow of cnpjs) {
      if (totalNew >= maxTotalDocs) {
        stoppedEarly = true;
        break;
      }

      if (!hasExecutionTime(startedAt)) {
        stoppedEarly = true;
        errors.push("Stopped early to avoid timeout; run Auto-Fetch again to continue.");
        break;
      }

      const cnpjDigits = cnpjRow.cnpj.replace(/[.\-\/]/g, "");

      try {
        const fnetDocs = await fetchRegulationsFromFnet(cnpjDigits, startedAt);
        totalFound += fnetDocs.length;

        let processedForCnpj = 0;

        for (const reg of fnetDocs) {
          if (processedForCnpj >= maxDocsPerCnpj || totalNew >= maxTotalDocs) {
            stoppedEarly = true;
            break;
          }

          if (!hasExecutionTime(startedAt, MIN_REMAINING_FOR_DOC_MS)) {
            stoppedEarly = true;
            errors.push(`Stopped early while processing ${cnpjDigits}; run again to continue.`);
            break;
          }

          const docId = String(reg.id);
          const sourceUrl = `fnet:${docId}`;

          if (existingUrls.has(sourceUrl)) continue;

          totalNew++;
          processedForCnpj++;

          const ingestResult = await ingestRegulationDocument({
            adminClient,
            competitorId,
            cnpjDigits,
            fundName: cnpjRow.fund_name,
            reg,
            sourceUrl,
            docId,
            startedAt,
          });

          if (ingestResult.ok) {
            existingUrls.add(sourceUrl);
            totalIngested++;
          } else {
            errors.push(ingestResult.error);
          }
        }
      } catch (err) {
        const message = errorToMessage(err);
        errors.push(`Error fetching FNET for ${cnpjDigits}: ${message}`);

        if (message.includes("Execution budget reached")) {
          stoppedEarly = true;
          break;
        }
      }
    }

    return jsonResponse({
      success: true,
      total_found: totalFound,
      total_new: totalNew,
      total_ingested: totalIngested,
      stopped_early: stoppedEarly,
      limits: {
        max_docs_per_cnpj: maxDocsPerCnpj,
        max_total_docs: maxTotalDocs,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("fnet-fetch error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

async function fetchRegulationsFromFnet(cnpjDigits: string, startedAt: number): Promise<FnetDoc[]> {
  const params = new URLSearchParams({
    d: "0",
    s: "0",
    l: String(DEFAULT_LIST_PAGE_SIZE),
    o: '[{"dataReferencia":"desc"}]',
    cnpjFundo: cnpjDigits,
    idCategoriaDocumento: "0",
    situacao: "A",
  });

  const listData = await fetchJsonWithRetry(
    `${FNET_LIST_URL}?${params}`,
    {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; LovableCloud/1.0)",
        Referer: "https://fnet.bmfbovespa.com.br/",
      },
    },
    LIST_FETCH_TIMEOUT_MS,
    MAX_LIST_FETCH_RETRIES,
    startedAt,
  );

  const allDocs = Array.isArray(listData?.data)
    ? listData.data
    : Array.isArray(listData?.dados)
      ? listData.dados
      : [];

  return allDocs.filter(
    (doc: FnetDoc) => normalizeText(doc.categoriaDocumento) === "regulamento",
  );
}

type IngestParams = {
  adminClient: ReturnType<typeof createClient>;
  competitorId: string;
  cnpjDigits: string;
  fundName: string | null;
  reg: FnetDoc;
  sourceUrl: string;
  docId: string;
  startedAt: number;
};

async function ingestRegulationDocument(params: IngestParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const { adminClient, competitorId, cnpjDigits, fundName, reg, sourceUrl, docId, startedAt } = params;

  let documentId: string | null = null;

  try {
    if (!hasExecutionTime(startedAt, MIN_REMAINING_FOR_DOC_MS)) {
      return { ok: false, error: `Skipped doc ${docId}: execution budget reached` };
    }

    const docResponse = await fetchDocumentWithRetry(docId, startedAt);
    const contentType = docResponse.headers.get("content-type") || "";
    const isPdf = contentType.includes("application/pdf");

    let textContent: string;
    const rawBytes = new Uint8Array(await docResponse.arrayBuffer());
    
    // Try unpdf first for any content
    try {
      const result = await extractText(rawBytes.buffer);
      textContent = (result.text || "").replace(/\s+/g, " ").trim();
      console.log(`Doc ${docId}: unpdf extracted ${textContent.length} chars`);
    } catch (_e) {
      // Fallback: try as HTML
      const htmlContent = new TextDecoder().decode(rawBytes);
      textContent = extractTextFromHtml(htmlContent);
      console.log(`Doc ${docId}: HTML fallback extracted ${textContent.length} chars`);
    }

    if (textContent.length < 50) {
      return {
        ok: false,
        error: `Doc ${docId}: extracted text too short (${textContent.length} chars)`,
      };
    }

    const docTitle =
      reg.descricaoDocumento ||
      reg.categoriaDocumento ||
      `Regulamento ${fundName || cnpjDigits}`;
    const fullTitle = `${docTitle} (${reg.dataReferencia || "sem data"})`;

    const { data: newDoc, error: docInsertErr } = await adminClient
      .from("regulation_documents")
      .insert({
        competitor_id: competitorId,
        title: fullTitle,
        source_url: sourceUrl,
        status: "processing",
      })
      .select("id")
      .single();

    if (docInsertErr || !newDoc) {
      return { ok: false, error: `Failed to insert doc record for ${docId}` };
    }

    documentId = newDoc.id;

    const chunks = chunkText(textContent, 500, 50).slice(0, MAX_CHUNKS_PER_DOC);
    const chunkRows = chunks.map((content, index) => ({
      document_id: newDoc.id,
      chunk_index: index,
      content,
    }));

    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50);
      const { error: batchErr } = await adminClient.from("regulation_chunks").insert(batch);
      if (batchErr) throw batchErr;
    }

    const { error: updateErr } = await adminClient
      .from("regulation_documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", newDoc.id);

    if (updateErr) throw updateErr;

    return { ok: true };
  } catch (err) {
    if (documentId) {
      await adminClient
        .from("regulation_documents")
        .update({ status: "failed" })
        .eq("id", documentId);
    }

    return {
      ok: false,
      error: `Error processing doc ${docId}: ${errorToMessage(err)}`,
    };
  }
}

function extractTextFromHtml(htmlContent: string): string {
  return htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim()
    .slice(0, 500000); // Cap at 500K chars to avoid tsvector overflow
}

/**
 * PDF text extraction — handles both uncompressed and FlateDecode-compressed streams.
 * For image-based/scanned PDFs, this will return empty/minimal text.
 */
function extractTextFromPdf(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  // First try extracting from decompressed content streams
  const streamTexts = extractFromStreams(raw, bytes);
  // Then try BT/ET blocks from raw content
  const btTexts = extractBtEtText(raw);

  const combined = [...streamTexts, ...btTexts].join(" ").replace(/\s+/g, " ").trim();
  return combined;
}

/** Extract text from BT...ET text objects */
function extractBtEtText(raw: string): string[] {
  const textParts: string[] = [];
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    extractTjFromBlock(match[1], textParts);
  }
  return textParts;
}

/** Extract Tj/TJ text operators from a BT block */
function extractTjFromBlock(block: string, out: string[]): void {
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  let m;
  while ((m = tjRegex.exec(block)) !== null) {
    out.push(m[1]);
  }
  const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
  while ((m = tjArrayRegex.exec(block)) !== null) {
    const strRegex = /\(([^)]*)\)/g;
    let s;
    while ((s = strRegex.exec(m[1])) !== null) {
      out.push(s[1]);
    }
  }
}

/** Try to decompress FlateDecode streams and extract text */
function extractFromStreams(raw: string, bytes: Uint8Array): string[] {
  const results: string[] = [];

  // Find stream boundaries in raw PDF
  const streamRegex = /stream\r?\n/g;
  const endStreamRegex = /\r?\nendstream/g;

  const streamStarts: number[] = [];
  let sm;
  while ((sm = streamRegex.exec(raw)) !== null) {
    streamStarts.push(sm.index + sm[0].length);
  }

  const streamEnds: number[] = [];
  while ((sm = endStreamRegex.exec(raw)) !== null) {
    streamEnds.push(sm.index);
  }

  for (let i = 0; i < Math.min(streamStarts.length, streamEnds.length, 100); i++) {
    const start = streamStarts[i];
    const end = streamEnds[i];
    if (end <= start || end - start > 5_000_000) continue;

    // Check if this stream uses FlateDecode by looking at the object header before it
    const headerRegion = raw.substring(Math.max(0, start - 500), start);
    const isFlate = headerRegion.includes("FlateDecode");

    if (!isFlate) continue;

    try {
      const streamBytes = bytes.slice(start, end);
      const decompressed = inflateSync(streamBytes);
      if (decompressed) {
        const text = new TextDecoder("latin1").decode(decompressed);
        // Extract BT/ET text from decompressed content
        const parts = extractBtEtText(text);
        if (parts.length > 0) {
          results.push(...parts);
        }
      }
    } catch {
      // Not a valid deflate stream or extraction failed, skip
    }
  }

  return results;
}

/**
 * Inflate (decompress) zlib/deflate data synchronously using DecompressionStream.
 * Falls back to manual zlib header stripping if needed.
 */
function inflateSync(data: Uint8Array): Uint8Array | null {
  try {
    // Try raw deflate first (most PDF FlateDecode streams)
    return decompressDeflateRaw(data);
  } catch {
    try {
      // Try with zlib header (2-byte header)
      if (data.length > 2) {
        return decompressDeflateRaw(data.slice(2));
      }
    } catch {
      // Give up
    }
  }
  return null;
}

/** Synchronous deflate decompression using Deno's built-in */
function decompressDeflateRaw(data: Uint8Array): Uint8Array | null {
  try {
    // Use pako-style manual decompression via ReadableStream
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    const chunks: Uint8Array[] = [];
    let done = false;

    // Write and close in a microtask
    writer.write(data).then(() => writer.close()).catch(() => {});

    // We need to read synchronously, but DecompressionStream is async.
    // Use a workaround: collect via promise
    return null; // Fall through to async version
  } catch {
    return null;
  }
}

/**
 * Async PDF text extraction with FlateDecode decompression support.
 */
async function extractTextFromPdfAsync(bytes: Uint8Array): Promise<string> {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  // Extract from raw BT/ET blocks (uncompressed)
  const btTexts = extractBtEtText(raw);

  // Try decompressing FlateDecode streams
  const streamTexts = await extractFromStreamsAsync(raw, bytes);

  const combined = [...streamTexts, ...btTexts].join(" ").replace(/\s+/g, " ").trim();
  return combined;
}

async function extractFromStreamsAsync(raw: string, bytes: Uint8Array): Promise<string[]> {
  const results: string[] = [];

  const streamRegex = /stream\r?\n/g;
  const endStreamRegex = /\r?\nendstream/g;

  const streamStarts: number[] = [];
  let sm;
  while ((sm = streamRegex.exec(raw)) !== null) {
    streamStarts.push(sm.index + sm[0].length);
  }

  const streamEnds: number[] = [];
  while ((sm = endStreamRegex.exec(raw)) !== null) {
    streamEnds.push(sm.index);
  }

  for (let i = 0; i < Math.min(streamStarts.length, streamEnds.length, 80); i++) {
    const start = streamStarts[i];
    const end = streamEnds[i];
    if (end <= start || end - start > 5_000_000) continue;

    const headerRegion = raw.substring(Math.max(0, start - 500), start);
    if (!headerRegion.includes("FlateDecode")) continue;

    try {
      const streamBytes = bytes.slice(start, end);
      const decompressed = await inflateAsync(streamBytes);
      if (decompressed && decompressed.length > 0) {
        const text = new TextDecoder("latin1").decode(decompressed);
        const parts = extractBtEtText(text);
        if (parts.length > 0) {
          results.push(...parts);
        }
      }
    } catch {
      // Skip failed streams
    }
  }

  return results;
}

async function inflateAsync(data: Uint8Array): Promise<Uint8Array | null> {
  // Try deflate-raw first, then with zlib header skip
  for (const slice of [data, data.length > 2 ? data.slice(2) : null]) {
    if (!slice) continue;
    try {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      writer.write(slice).then(() => writer.close()).catch(() => writer.close().catch(() => {}));

      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      if (chunks.length > 0) {
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        return result;
      }
    } catch {
      // Try next slice
    }
  }

  // Try "deflate" (with zlib wrapper) as last resort
  try {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(data).then(() => writer.close()).catch(() => writer.close().catch(() => {}));

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    if (chunks.length > 0) {
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    }
  } catch {
    // Give up
  }

  return null;
}

/**
 * Paragraph-aware chunking: splits on double newlines first,
 * then groups paragraphs until ~targetWords, with 1-paragraph overlap.
 * Falls back to word-based chunking if no paragraph breaks.
 */
function chunkText(text: string, targetWords: number = 400, _overlap: number = 50): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  
  if (paragraphs.length <= 1) {
    return chunkTextByWords(text, targetWords, _overlap);
  }
  
  const chunks: string[] = [];
  let currentParagraphs: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;
    
    if (currentWordCount + paraWords > targetWords && currentParagraphs.length > 0) {
      chunks.push(currentParagraphs.join("\n\n"));
      // Keep last paragraph for overlap
      const last = currentParagraphs[currentParagraphs.length - 1];
      currentParagraphs = [last];
      currentWordCount = last.split(/\s+/).length;
    }
    
    currentParagraphs.push(para);
    currentWordCount += paraWords;
  }

  if (currentParagraphs.length > 0) {
    chunks.push(currentParagraphs.join("\n\n"));
  }

  return chunks.length > 0 ? chunks : [text];
}

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

async function fetchDocumentWithRetry(docId: string, startedAt: number): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= DOC_FETCH_MAX_RETRIES; attempt++) {
    try {
      const timeoutMs = getBudgetAwareTimeout(startedAt, FETCH_TIMEOUT_MS, MIN_REMAINING_FOR_DOC_MS);
      if (!timeoutMs) {
        throw new Error("Execution budget reached before doc fetch");
      }

      const docRes = await fetchWithTimeout(`${FNET_DOC_URL}?cvm=true&id=${docId}`, undefined, timeoutMs);
      if (!docRes.ok) {
        throw new Error(`HTTP ${docRes.status}`);
      }

      return docRes;
    } catch (error) {
      lastError = error;
      if (attempt === DOC_FETCH_MAX_RETRIES) {
        break;
      }
      await wait(350 * attempt);
    }
  }

  throw new Error(`doc fetch retries exhausted: ${errorToMessage(lastError)}`);
}

async function fetchJsonWithRetry(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  maxAttempts: number,
  startedAt: number,
): Promise<Record<string, unknown>> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const attemptTimeout = getBudgetAwareTimeout(startedAt, timeoutMs);
      if (!attemptTimeout) {
        throw new Error("Execution budget reached before FNET list fetch");
      }

      const response = await fetchWithTimeout(input, init, attemptTimeout);
      if (!response.ok) {
        throw new Error(`FNET list failed: HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
      await wait(250 * attempt);
    }
  }

  throw new Error(`Unknown FNET fetch error: ${errorToMessage(lastError)}`);
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

async function safeJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRemainingBudgetMs(startedAt: number): number {
  return EXECUTION_BUDGET_MS - (Date.now() - startedAt);
}

function hasExecutionTime(startedAt: number, reserveMs = MIN_REMAINING_FOR_FETCH_MS): boolean {
  return getRemainingBudgetMs(startedAt) > reserveMs;
}

function getBudgetAwareTimeout(
  startedAt: number,
  desiredTimeoutMs: number,
  reserveMs = MIN_REMAINING_FOR_FETCH_MS,
): number | null {
  const remaining = getRemainingBudgetMs(startedAt) - 1000;
  if (remaining < reserveMs) return null;
  return Math.max(1000, Math.min(desiredTimeoutMs, remaining));
}

function errorToMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

function normalizeLimit(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
