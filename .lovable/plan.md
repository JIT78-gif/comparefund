

## Problem: Chat shows "no regulations found" despite documents being ingested

### Root Cause
The FNET document endpoint (`exibirDocumento?cvm=true&id=...`) returns **PDF files embedded in HTML**, not readable HTML text. The current `extractTextFromHtml` function strips HTML tags but the actual content is raw PDF binary data (base64-encoded `%PDF-1.x` headers visible in all chunks). This means:
- All 21 "ready" documents have **1 chunk each** of garbage binary data
- The `search_regulations` full-text search finds nothing meaningful
- Chat correctly reports "no regulations found"

### Plan

#### 1. Clean existing malformed data
- Run a migration to DELETE all `regulation_chunks` and reset all `regulation_documents` to allow re-fetching
- This clears the garbage binary chunks and removes `source_url` entries so FNET fetch treats them as new

#### 2. Fix `fnet-fetch` to handle PDF responses properly
The FNET endpoint returns PDF binary when `cvm=true`. Two changes needed:

**a) Detect PDF responses and use a text extraction approach:**
- Check `Content-Type` header for `application/pdf`
- If PDF, read as `ArrayBuffer` and apply the same `extractTextFromPdf` logic already in `rag-ingest`
- If HTML, use existing `extractTextFromHtml`

**b) Copy `extractTextFromPdf` from `rag-ingest` into `fnet-fetch`:**
- The function already exists in `rag-ingest/index.ts` (lines 200-231)
- Replicate it in `fnet-fetch/index.ts`

#### 3. Validate chunk quality
- After PDF text extraction, check if extracted text length > 50 chars (already exists)
- Log a warning if extraction yields minimal text (image-based PDF)

### Files to modify
- `supabase/functions/fnet-fetch/index.ts` — add PDF detection + `extractTextFromPdf` function
- Database migration — delete all existing regulation_chunks and regulation_documents to allow clean refetch

### Technical detail
The `extractTextFromPdf` function parses raw PDF binary by finding `BT...ET` text objects and extracting `Tj`/`TJ` operators. This works for text-based PDFs but will fail for scanned/image PDFs (which would need OCR, out of scope).

