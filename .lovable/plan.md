

## Plan: Filter FundSelector to show only the selected company's funds

### Problem
In "Compare Periods" mode, when you select a single company (e.g., Sifra), the FundSelector shows funds from ALL companies in the response data instead of just the selected company's funds.

### Root Cause
`extractFundHierarchy` iterates over all companies in the response. The `fundHierarchy` passed to `FundSelector` is unfiltered regardless of mode.

### Fix
**File: `src/pages/Statements.tsx`**

In the `fundHierarchy` memo (line 159), filter the hierarchy based on the current mode:
- **"companies" mode**: Show funds for all `selectedCompanies`
- **"periods" mode**: Show funds only for `singleCompany`

```typescript
const fundHierarchy = useMemo(() => {
  const full = extractFundHierarchy(displayData);
  if (mode === "periods") {
    // Only show the single selected company's funds
    return singleCompany && full[singleCompany]
      ? { [singleCompany]: full[singleCompany] }
      : {};
  }
  // In companies mode, filter to only selected companies
  const filtered: FundHierarchy = {};
  for (const key of selectedCompanies) {
    if (full[key]) filtered[key] = full[key];
  }
  return filtered;
}, [displayData, mode, singleCompany, selectedCompanies]);
```

Also reset CNPJ selection when `singleCompany` changes (line 162-164), so stale selections from a previous company don't persist:

```typescript
useEffect(() => {
  setSelectedCnpjs(new Set());
}, [displayData, singleCompany, mode]);
```

### Scope
Single file change (`src/pages/Statements.tsx`), two small edits.

