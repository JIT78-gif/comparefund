

## Plan: Improve Data Extraction & CNPJ Search Logic

This plan covers two areas: (1) hardening the CSV data extraction pipeline with validation, and (2) enhancing the CNPJ discovery search in `cvm-discover`.

---

### 1. Data Validation in Edge Functions

**Files:** `supabase/functions/cvm-compare/index.ts`, `supabase/functions/cvm-statements/index.ts`

- Add CSV row validation: skip rows where CNPJ is empty or malformed (not 14 digits after cleaning)
- Add numeric range checks: flag/log values that are negative or suspiciously large (e.g., net_assets > 1 trillion)
- Add row count logging per fund to detect duplicate aggregation
- Validate that `parseNum` handles edge cases: empty strings, commas as thousands separators, negative values with parentheses
- Log summary stats after parsing: total rows parsed, rows matched, rows skipped with reasons

### 2. Improve `cvm-discover` Search Logic

**File:** `supabase/functions/cvm-discover/index.ts`

- **Exact CNPJ search**: Already supported via `searchCnpjs` param — clean up to handle formatted CNPJs (with dots/slashes) and partial CNPJ matching (prefix search)
- **Partial name search**: Add fuzzy/substring matching — split multi-word search terms and match if ALL words appear (instead of exact substring), enabling queries like "ATENA SECURITIZADORA" to match "FIDC ATENA SECURITIZADORA DE RECEBIVEIS"
- **Fallback search**: If Tab I yields zero results, also scan Tab IV (which has `DENOM_SOCIAL`) as a fallback
- **Deduplication**: Current results can contain duplicate CNPJs from multiple rows in the same file — deduplicate by CNPJ, keeping the richest record
- **Result pagination/limiting**: Add `limit` parameter (default 100) to prevent massive response payloads; return `total_matches` count alongside truncated results
- **Response caching**: Cache search results in memory (per edge function invocation) — not persistent, but avoid re-parsing the same ZIP if called with different search terms in sequence

### 3. Add Search Results to Admin UI

**File:** `src/pages/Admin.tsx`

- Add a "Search CVM" panel in the Competitors tab that calls `cvm-discover`
- Allow admin to search by name or CNPJ, view results, and one-click add a found CNPJ to a competitor
- Show fund name, admin, type, and CNPJ in search results

### 4. CSV Export Validation Test Cases

**File:** `src/test/csv-validation.test.ts` (new)

- Unit tests for `parseNum` edge cases (extract to shared utility)
- Unit tests for `cleanCnpj` with various formats
- Test that search logic correctly handles: exact CNPJ, partial name, multi-word, empty results

---

### Technical Details

**`cvm-discover` search improvements (pseudocode):**
```text
// Multi-word matching
const termWords = term.split(/\s+/);
const allWordsMatch = termWords.every(w => searchText.includes(w));

// Partial CNPJ (prefix match)
const cnpjMatched = cnpjSearch.some(c => rowCnpj.startsWith(c) || c === rowCnpj);

// Dedup by CNPJ
const seen = new Set<string>();
if (seen.has(rowCnpj)) continue;
seen.add(rowCnpj);

// Limit results
if (matches.length >= limit) break;
```

**Validation in parsers:**
```text
// Skip invalid CNPJ rows
const cnpj = cleanCnpj(row[cnpjIdx] || "");
if (!/^\d{14}$/.test(cnpj)) continue;

// Log anomalies
if (val > 1e12) console.warn(`Suspicious value ${val} for ${cnpj}`);
```

### Implementation Order
1. Improve `cvm-discover` search logic (exact CNPJ, partial name, dedup, limit)
2. Add data validation checks to `cvm-compare` and `cvm-statements`
3. Add CVM search panel to Admin UI
4. Create test file for shared utilities

