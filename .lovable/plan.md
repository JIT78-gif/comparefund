

## Add Atena Tecnologia and Cifra S.A. Credit to the Comparison

### Overview
Currently the page compares only Multiplica vs Red. We'll expand it to compare all 4 companies: Multiplica, Red, Atena Tecnologia, and Cifra S.A. Credit. Since we don't know the CNPJs for Atena and Cifra, we'll first add a CNPJ discovery mechanism that searches CVM data by fund name.

### Step 1: Create a Discovery Edge Function

Create a new edge function `cvm-discover` that:
- Downloads the CVM ZIP for a given month (e.g., 202501)
- Parses tab_I to extract all fund names (DENOM_SOCIAL) and their CNPJs
- Filters by search terms like "ATENA" and "CIFRA"
- Returns matching fund names and CNPJs so we can identify the correct Standard and NP funds

This is a one-time utility to find the CNPJs. We'll call it, read the logs, and then hardcode the discovered CNPJs.

### Step 2: Update Edge Function with New Companies

Once we have the CNPJs, update `cvm-compare/index.ts`:
- Add `atena` and `cifra` entries to the `CNPJS` map with their Standard and NP fund CNPJs
- Add any NP override entries if needed
- Update the `fundCounts` initialization to include `atena` and `cifra`
- Update the `results` aggregation to include all 4 companies
- Change the response structure from `{ multiplica, red, details }` to a dynamic company map

### Step 3: Update Frontend to Support 4 Companies

Update `src/pages/Compare.tsx`:
- Change the `CompareResponse` interface to use a dynamic map of companies instead of only `multiplica` and `red`
- Define a company config array with names, colors, and display labels for all 4 companies
- Update metric cards to show a scrollable grid for all 4 companies (PL + Delinquency for each)
- Update bar charts to show 4 bars per chart instead of 2
- Update the data table to show 4 rows
- Update the fund details section to handle all companies
- Update the page title from "Multiplica vs Red" to something like "FIDC Comparison"

### Technical Details

**Discovery function** (`supabase/functions/cvm-discover/index.ts`):
- POST with `{ refMonth, searchTerms: ["ATENA", "CIFRA"] }`
- Returns `{ matches: [{ cnpj, name, fund_type_detected }] }`

**Edge function changes** (`supabase/functions/cvm-compare/index.ts`):
- CNPJS map: add `atena: [standardCnpj, npCnpj]` and `cifra: [standardCnpj, npCnpj]`
- Results initialization: add `atena` and `cifra` keys
- Response: `{ multiplica: {...}, red: {...}, atena: {...}, cifra: {...}, details: [...] }`

**Frontend changes** (`src/pages/Compare.tsx`):
- Company config:
```text
COMPANIES = [
  { key: "multiplica", label: "Multiplica", color: "bg-primary", chartColor: "hsl(160,100%,45%)" },
  { key: "red",        label: "Red",        color: "bg-accent",  chartColor: "hsl(20,100%,57%)" },
  { key: "atena",      label: "Atena",      color: "bg-secondary", chartColor: "hsl(221,100%,65%)" },
  { key: "cifra",      label: "Cifra",      color: "bg-yellow-500", chartColor: "hsl(45,100%,50%)" },
]
```
- CompareResponse becomes `Record<string, CompanyData> & { details: FundDetail[] }`
- Metric cards grid: 4 columns for PL, then 4 for delinquency (or 2 rows of 4)
- Charts: 4 bars per chart
- Table: 4 rows dynamically generated from company config

### Sequence
1. Deploy `cvm-discover` and call it to find Atena/Cifra CNPJs
2. Read logs to get the CNPJs
3. Update `cvm-compare` with the new company CNPJs
4. Update the frontend to render all 4 companies
5. Deploy and test

