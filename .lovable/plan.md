

# RAG Chat for Fund Regulations

## Approach

Use **Supabase Storage** (built into Lovable Cloud) for PDF file storage instead of Google — no external connector needed, simpler setup. For text extraction from PDFs, we'll use the **Firecrawl** connector which can scrape/extract content from URLs, or we can extract text directly in the edge function.

The full-text search approach with Postgres `tsvector` remains the best fit — no embeddings API needed.

## Architecture

```text
Admin uploads PDF (or pastes CVM URL)
        │
        ▼
  rag-ingest (edge function)
  ├─ Store PDF in Supabase Storage bucket "regulations"
  ├─ Extract text (pdf-parse or fetch markdown via URL)
  ├─ Chunk text (~500 tokens, overlapping)
  └─ Store chunks in regulation_chunks table (with tsvector)
        │
        ▼
User asks question in Compare page chat
        │
        ▼
  rag-chat (edge function)
  ├─ Full-text search regulation_chunks
  ├─ Retrieve top 10 chunks as context
  ├─ Send to Gemini 3 Flash via Lovable AI gateway
  └─ Stream response back
```

## Implementation

### 1. Database Migration

- **`regulation_documents`** table: id, competitor_id (FK), title, source_url, file_path (storage), status, created_at
- **`regulation_chunks`** table: id, document_id (FK), chunk_index, content (text), search_vector (tsvector), created_at
- GIN index on search_vector
- `search_regulations(query_text, competitor_slugs[])` SQL function
- RLS: authenticated users can SELECT; service_role can INSERT/UPDATE/DELETE

### 2. Storage Bucket

- Create `regulations` bucket for PDF files (private, authenticated access)

### 3. Edge Function: `rag-ingest`

- Admin-only (checks user role via service_role client)
- Accepts: uploaded PDF file OR URL to scrape
- If file: store in `regulations` bucket, extract text using basic PDF text extraction
- If URL: fetch content as text/markdown
- Chunk the text into ~500-token segments with ~50-token overlap
- Insert document metadata + chunks with auto-generated tsvector
- Returns chunk count

### 4. Edge Function: `rag-chat`

- Authenticated users only
- Receives: question, optional competitor_ids filter
- Calls `search_regulations()` to get top 10 matching chunks
- Builds prompt with regulation context + user question
- System prompt: "You are a FIDC regulation expert. Answer in the user's language. Compare regulations when chunks from multiple competitors are present."
- Streams response from `google/gemini-3-flash-preview` via Lovable AI gateway
- Returns SSE stream

### 5. Frontend: `RegulationChat.tsx`

- Floating button (bottom-right) on Compare page with "Regulamentos" label
- Opens a Sheet/Drawer with:
  - Chat message list (markdown rendered via simple prose styles)
  - Competitor filter chips (pre-populated from loaded competitors)
  - Text input + send button at bottom
  - SSE streaming display
- State managed in React (no persistence)

### 6. Admin: Regulation Ingestion Section

- New collapsible section in Admin page: "Regulamentos"
- Per competitor: list ingested documents with chunk count
- "Upload PDF" button (file input)
- "Ingest from URL" input field
- Status indicators (ingesting/done/error)

### Files

| File | Action |
|------|--------|
| Migration SQL | New: tables, function, storage bucket |
| `supabase/functions/rag-ingest/index.ts` | New |
| `supabase/functions/rag-chat/index.ts` | New |
| `supabase/config.toml` | Add function entries |
| `src/components/RegulationChat.tsx` | New |
| `src/pages/Compare.tsx` | Add floating chat button |
| `src/pages/Admin.tsx` | Add regulation ingestion UI |
| `src/contexts/LanguageContext.tsx` | Add translation keys for chat UI |

