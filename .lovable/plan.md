

## Plan: Replace Custom RAG with Google Gemini File Search

The current RAG system hallucates because the custom chunking/search is weak (latest docs only have 1 chunk each). Google's File Search API handles chunking, embedding, and retrieval natively with grounded generation — eliminating hallucinations.

### Prerequisites
- You will need to provide a **Gemini API key** (from [Google AI Studio](https://aistudio.google.com/apikey))

### Change 1 — New DB table to track File Search Stores

A small table `google_file_stores` to remember which Google File Search Store each competitor's latest doc was uploaded to:

| Column | Type |
|--------|------|
| id | uuid PK |
| competitor_id | uuid (unique) |
| store_name | text (Google's fileSearchStores/xxx ID) |
| document_id | uuid (which regulation_document was uploaded) |
| created_at / updated_at | timestamptz |

### Change 2 — New edge function `sync-file-store`

Called after ingestion or manually. For each active competitor:
1. Gets the latest "ready" regulation document
2. Concatenates all its chunks into a single text file
3. Creates a Google File Search Store (or reuses existing)
4. Uploads the text via the REST API (`POST generativelanguage.googleapis.com/v1beta/fileSearchStores/{id}:uploadToFileSearchStore`)
5. Saves the store name in `google_file_stores`

### Change 3 — Modify `rag-chat` edge function

Replace the custom `search_regulations` call with a direct Gemini API call using the File Search tool:
- Fetch all file search store names from `google_file_stores` (filtered by selected competitors)
- Call `POST generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` with:
  - `tools: [{ fileSearch: { fileSearchStoreNames: [...] } }]`
  - System prompt + user messages
- Stream the response back (Gemini supports SSE streaming)
- This means answers are **grounded only on uploaded documents** — no hallucination

### Change 4 — Modify `rag-ingest` to trigger sync

After successfully ingesting a document, call the `sync-file-store` function to upload the new doc to Google File Search.

### Change 5 — Keep chat UI unchanged

`RegulationChat.tsx` stays the same — it already calls `rag-chat` and handles streaming.

### Files to modify/create
| File | Change |
|------|--------|
| New migration | Create `google_file_stores` table |
| `supabase/functions/sync-file-store/index.ts` | New — uploads latest docs to Google File Search |
| `supabase/functions/rag-chat/index.ts` | Use Gemini File Search instead of custom search |
| `supabase/functions/rag-ingest/index.ts` | Trigger sync after ingestion |
| `supabase/config.toml` | Add `sync-file-store` function config |

### Technical note
Google File Search API is called directly (not via Lovable AI gateway) because the gateway doesn't support the `fileSearch` tool parameter. This requires a `GEMINI_API_KEY` secret.

