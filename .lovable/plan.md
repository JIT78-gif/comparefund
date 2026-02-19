

## Fix: Liabilities, Unit Variation, and NP Fund Type

### Issues Found (from edge function logs)

1. **Liabilities always R$ 0.00** -- The code declares `fundLiabilities` map but never populates it. Tab III (passivos/liabilities) is not in the `targetTables` array, so it's never parsed.

2. **Unit Variation always 0%** -- The `unit_value` field is never assigned anywhere. Tab IV contains a quota/unit value field that needs to be extracted.

3. **Fund type always STANDARD** -- The column `TP_FUNDO` in tab_I may not exist or contain the expected values. Also, the `fundType` parameter received from the frontend is never used to filter results.

---

### Changes

#### Edge Function (`supabase/functions/cvm-compare/index.ts`)

**Add tab_III to parsed tables:**
- Add `"tab_III"` to the `targetTables` array
- Parse tab_III CSV looking for the liabilities column (e.g., `TAB_III_A_VL_PASSIVO` or similar passivo field)
- Populate `fundLiabilities[cnpj]` and `results[company].liabilities`

**Extract unit value from tab_IV:**
- Look for `TAB_IV_VL_QUOTA` or `TAB_IV_A_VL_COTA` column in tab_IV rows
- For each company, compute unit variation as percentage change (requires fetching previous month data, or using the quota variation field if available)
- Alternatively, look for a quota variation column directly in the data

**Fix fund type detection:**
- Log tab_I headers to identify the correct column for NP vs STANDARD classification (likely `CLASSE_SERIE` or `CONDOM` rather than `TP_FUNDO`)
- Common NP indicators: fund name contains "NAO PADRONIZADO" or "NP", or a specific CVM classification field
- As a reliable fallback, check if the fund name (DENOM_SOCIAL) contains "NAO PADRONIZADO" or "NP"

**Use fundType parameter for filtering:**
- After building the details array, filter results to only include funds matching the requested `fundType` (STANDARD or NP)
- Recalculate aggregated metrics after filtering

#### Frontend (`src/pages/Compare.tsx`)

- No changes needed -- the frontend already renders liabilities, unit variation chart, and fund type badges correctly. The issue is purely backend data.

### Technical Sequence

1. Add `tab_III` parsing for liabilities
2. Add unit value / quota extraction from tab_IV
3. Fix fund type detection using fund name as fallback
4. Apply `fundType` filter before returning results
5. Deploy and test with both Standard and NP toggles

