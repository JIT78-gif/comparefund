

## Plan: Search by Manager (Gestora) via CVM Open Data

### Problem
Currently, the admin can only search by fund name or CNPJ in the CVM database. The user wants to search by **Asset Manager (Gestora)** name — e.g., "Multiplica Capital" — and get all funds managed by that entity.

### Key Insight — No CAPTCHA Needed
The user mentioned scraping `sistemas.cvm.gov.br/?cadgeral` and solving a CAPTCHA. However, CVM publishes **open data CSV files** at `dados.cvm.gov.br` that already contain manager/administrator information in the FIDC monthly report ZIPs — the same data source the app already uses. The existing `cvm-discover` edge function already parses these ZIPs and has an `ADMIN` field search. 

The ADMIN column in the CVM data represents the fund **administrator** (custodian), not the **asset manager (gestora)**. However, for FIDCs, the administrator name often correlates closely with the manager. Additionally, the CVM open data portal provides a **fund registration file** at `https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip` which contains `registro_fundo.csv` with columns including the **GESTOR** (asset manager) name and CNPJ.

### Approach

**1. New edge function: `cvm-manager-search`**
- Downloads the CVM fund registration ZIP (`registro_fundo_classe.zip`) which contains `registro_fundo.csv`
- This CSV has columns like: `CNPJ_FUNDO`, `DENOM_SOCIAL`, `GESTOR`, `CNPJ_GESTOR`, `ADMIN`, `SIT`, `TP_FUNDO`, etc.
- Searches by manager name (GESTOR column) using the same multi-word matching logic from `cvm-discover`
- Returns all funds associated with that manager, filtered to active FIDC funds
- Also supports searching by manager CNPJ

**2. Update Admin UI (`src/pages/Admin.tsx`)**
- Add a new search mode toggle: "CVM Monthly Data" (existing) vs "Manager Registry" (new)
- The "Manager Registry" mode calls the new `cvm-manager-search` function
- Results show all funds for the manager with a "Add All" bulk action and individual add buttons
- Keep existing CNPJ/name search fully functional

**3. Update `supabase/config.toml`**
- Add `[functions.cvm-manager-search]` with `verify_jwt = false`

### Files to Create/Edit

| File | Action | Description |
|---|---|---|
| `supabase/functions/cvm-manager-search/index.ts` | **Create** | New edge function that downloads `registro_fundo_classe.zip`, parses `registro_fundo.csv`, and searches by GESTOR name or CNPJ |
| `supabase/config.toml` | **Edit** | Add function config entry |
| `src/pages/Admin.tsx` | **Edit** | Add "Search by Manager" tab/mode in the CVM Search panel with a toggle between existing search and manager search |

### Edge Function Detail (`cvm-manager-search`)

```
Input: { searchTerms: string[], searchCnpjs?: string[], limit?: number }
Output: { 
  manager_name: string,
  manager_cnpj: string,
  funds: [{ cnpj, name, admin, tp_fundo, sit }],
  total_funds: number 
}
```

- Fetches `https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip`
- Unzips and parses `registro_fundo.csv`
- Filters rows where GESTOR column matches search terms (multi-word AND matching)
- Optionally filters by CNPJ_GESTOR for exact manager lookup
- Returns grouped results by manager with all their funds
- Filters to show only FIDC-type funds (TP_FUNDO containing "FIDC" or similar) to keep results relevant

### Admin UI Changes

In the CVM Search Panel, add a `Select` to switch search source:
- **"Informe Mensal"** (default, existing behavior via `cvm-discover`)
- **"Cadastro por Gestora"** (new, calls `cvm-manager-search`)

When "Cadastro por Gestora" is selected:
- Input placeholder changes to "Manager name..."
- Search field selector hidden (not applicable)
- Month selector hidden (registry is current, not month-based)
- Results table shows: CNPJ | Fund Name | Type | Status | [Add] button
- Add "Add All Funds" button to bulk-add all results to a selected competitor

