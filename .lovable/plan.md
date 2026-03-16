

## Plan: Remove Auto-Fetch, Download All Regulations Once, Keep Manual Only

### What we'll do

1. **Download all regulation PDFs now** — I'll use the existing `fnet-fetch` edge function to call it repeatedly from the backend for each competitor, one at a time, with higher limits (all docs per CNPJ). This runs server-side so no browser timeouts.

2. **Remove auto-fetch UI** — Strip the "Auto-Fetch All from FNET" button and per-competitor fetch buttons from the Admin page. Keep only the manual ingestion form (Paste Text / From URL / Upload PDF).

3. **Optionally delete the `fnet-fetch` edge function** — Since it won't be needed anymore. Or keep it as a dormant utility.

### Execution order

| Step | What | How |
|------|------|-----|
| 1 | Bulk-download regulations | Call `fnet-fetch` via backend curl for each of the 4 competitors (Multiplica, Red, Sifra, Atena) with `max_docs_per_cnpj: 30, max_total_docs: 60`. Repeat calls until no new docs are found. |
| 2 | Verify ingestion | Query `regulation_documents` and `regulation_chunks` to confirm documents have real text content |
| 3 | Remove auto-fetch UI | Edit `Admin.tsx` — remove the FNET fetch section, buttons, state variables, and handler functions |
| 4 | Clean up | Delete `supabase/functions/fnet-fetch/` directory and its config.toml entry |

### Technical details

- There are 12 active CNPJs across 3 competitors with CNPJs (Atena has none)
- Each `fnet-fetch` call has a 50s execution budget, processing ~3 docs per run
- I'll need to call it multiple times per competitor until all "Regulamento" documents are ingested
- The existing `rag-ingest` function remains for future manual uploads
- Embeddings will be generated during ingestion (using the LOVABLE_API_KEY already configured)

### Files affected
- `src/pages/Admin.tsx` — remove auto-fetch section
- `supabase/functions/fnet-fetch/` — delete entirely
- `supabase/config.toml` — remove fnet-fetch entry (auto-managed, will update)

