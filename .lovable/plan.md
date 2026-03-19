

## Fix: Pre-2024 Data Not Loading in Statements

### Problem
The edge function `cvm-statements` finds **zero rows** for months before October 2023. The logs confirm: `total=0 matched=0`. 

**Root cause**: CVM changed their CSV column names in October 2023 (RCVM 175 reform). The old format uses `CNPJ_FUNDO` while the new format uses `CNPJ_FUNDO_CLASSE`. The parser on line 202 only looks for `CNPJ_FUNDO_CLASSE` — so every row in older files is silently skipped.

**Secondary issue**: For pre-2019 months, the ZIP contains the entire year's data. Without filtering by the reference date column (`DT_COMPTC` or `DT_COMPT`), all 12 months would be mixed together.

### Changes

**File: `supabase/functions/cvm-statements/index.ts`**

1. **Support both CNPJ column names** (line 202): Try `CNPJ_FUNDO_CLASSE` first, fall back to `CNPJ_FUNDO`
2. **Filter by reference month for yearly ZIPs** (pre-2019): Find the `DT_COMPTC` or `DT_COMPT` column and skip rows whose date doesn't match the requested month
3. **Support old fund type column name**: Already partially handled on line 221 (`TP_FUNDO` fallback exists), but also handle `DENOM_SOCIAL` → `NM_FUNDO_CLASSE` for the name column

**File: `supabase/functions/cvm-compare/index.ts`**

4. Apply the same CNPJ column fallback fix (line 163) for consistency — though this may already work if Compare only targets recent months.

### Technical Detail

```text
Line 202 current:
  const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");

Line 202 new:
  let cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
  if (cnpjIdx === -1) cnpjIdx = header.indexOf("CNPJ_FUNDO");

For yearly ZIPs, add month filtering:
  const dtIdx = header.indexOf("DT_COMPTC") !== -1 
    ? header.indexOf("DT_COMPTC") 
    : header.indexOf("DT_COMPT");
  // In row loop, skip if date doesn't match requested YYYYMM
```

