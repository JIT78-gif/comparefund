

# Auto-Fetch Regulations from Fundos.NET

## Discovery

I confirmed the FNET API works. Key findings:
- **List endpoint**: `GET https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados` with params `cnpjFundo=CNPJ_DIGITS_ONLY&idCategoriaDocumento=0&situacao=A` returns JSON with document metadata
- **View endpoint**: `GET https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?cvm=true&id=DOC_ID` returns HTML content of the document
- Documents have `categoriaDocumento` field — we filter for `"Regulamento"`
- CNPJ must be digits only (no dots/dashes), and `tipoFundo` param must be omitted for FIDC

## Plan

### 1. New Edge Function: `fnet-fetch`
- Takes `competitor_id` as input
- Looks up all active CNPJs for that competitor from `competitor_cnpjs` table
- For each CNPJ, calls the FNET API to list all documents
- Filters results where `categoriaDocumento === "Regulamento"`
- Skips documents already ingested (checks `regulation_documents.source_url`)
- For each new regulation document:
  - Fetches HTML content via `exibirDocumento?cvm=true&id=DOC_ID`
  - Strips HTML tags to extract text
  - Chunks text (~500 tokens, 50 overlap)
  - Inserts into `regulation_documents` + `regulation_chunks`
- Returns summary: how many found, how many new, how many ingested

### 2. Admin UI Update (`Admin.tsx`)
- Add "Auto-Fetch from FNET" button next to the manual ingestion form
- Shows per-competitor fetch button or a "Fetch All" button
- Displays progress/status during fetch
- After completion, refreshes the documents list

### 3. Config Update (`supabase/config.toml`)
- Add `[functions.fnet-fetch]` with `verify_jwt = false`

### Files

| File | Action |
|------|--------|
| `supabase/functions/fnet-fetch/index.ts` | New edge function |
| `supabase/config.toml` | Add function entry |
| `src/pages/Admin.tsx` | Add auto-fetch button to RegulationsAdmin |

