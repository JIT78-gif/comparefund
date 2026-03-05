

## Plan: Fix Build Error + Fund & CNPJ Selection System

### 1. Fix Build Error
The `cvm-column-discovery/index.ts` edge function fails because Deno can't resolve `npm:jszip@3.10.1`. This is a utility function (not used at runtime), so the simplest fix is to use the Deno-native fetch approach or add an import map. Since `cvm-statements` uses the same import and works, the issue is likely deployment-specific. I'll add an import map via `supabase/functions/deno.json` to register the npm dependency.

**File**: Create `supabase/functions/deno.json` with `"nodeModulesDir": "auto"` and JSZip import.

### 2. Fund & CNPJ Selection System

The edge function already returns per-CNPJ data with `fund_name` and `fund_type` fields under each company. Currently, `getValue` in `Statements.tsx` blindly sums ALL CNPJs under a company. The plan is to:

#### 2a. Extract available funds from response data
After data loads, parse the response to build a hierarchy:
```text
Manager (e.g., "Multiplica")
  └─ CNPJ 23216398000101 (fund_name: "MULTIPLICA FIDC")
  └─ CNPJ 40211675000102 (fund_name: "MULTIPLICA FIDC NP")
```

#### 2b. Create FundSelector component
- New component `src/components/FundSelector.tsx`
- Popover/dropdown triggered by a button in the controls row
- Hierarchical tree: Company > CNPJ (with fund name)
- Multi-select checkboxes, all selected by default
- Expand/collapse per company
- "Select All" / "Deselect All" buttons
- Shows count badge of selected CNPJs
- State stored as `Set<string>` of selected CNPJs

#### 2c. Update getValue to filter by selected CNPJs
In `Statements.tsx`, modify the `aggregate` function inside `getValue` to only iterate over CNPJs that are in the selected set. When set is empty (or all selected), aggregate all (current behavior).

```typescript
const aggregate = (companyData: Record<string, Record<string, number | string>>) => {
  let sum = 0, count = 0;
  for (const [cnpj, cnpjData] of Object.entries(companyData)) {
    if (selectedCnpjs.size > 0 && !selectedCnpjs.has(cnpj)) continue; // NEW
    const v = typeof cnpjData[accountId] === "number" ? cnpjData[accountId] as number : 0;
    // ... rest unchanged
  }
};
```

#### 2d. Auto-populate available CNPJs when data loads
Use a `useEffect` that runs when `displayData` changes to extract available companies/CNPJs/fund names and initialize the selection set with all CNPJs selected.

### Files to create/modify

| File | Action |
|------|--------|
| `supabase/functions/deno.json` | **Create** — add `nodeModulesDir: "auto"` to fix JSZip build error |
| `src/components/FundSelector.tsx` | **Create** — hierarchical fund/CNPJ selection popover |
| `src/pages/Statements.tsx` | **Modify** — add FundSelector, pass selectedCnpjs to getValue, extract available funds from data |

