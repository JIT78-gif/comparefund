

## Hierarchical Financial Statements Comparison Dashboard

### Overview
Build a new "Statements" page that presents CVM monthly report data as an interactive, expandable tree grid -- mirroring the standardized Chart of Accounts (CoA) structure that all FIDCs use. This replaces the current summary-chart approach with a detailed, accountant-friendly balance sheet view.

### What You Will Get

1. **Tree Grid View** -- A table where rows are the hierarchical accounts (e.g., "1 - Ativo Total" with expandable children like "1.1 - Disponibilidades", "1.2 - Carteira"), and columns are the selected companies side-by-side.

2. **Multi-Company Comparison** -- Select 2-4 companies and see their values for every account line item in adjacent columns for the same month.

3. **Period-over-Period Comparison** -- Select a single company (e.g., Multiplica) and compare it against itself across different months (e.g., Jan/2025 vs Feb/2025 vs Mar/2025) as separate columns.

4. **Expand/Collapse** -- Parent accounts show totals; click to expand and see the detailed child accounts underneath.

---

### Account Hierarchy (Based on CVM Structure)

The CVM FIDC monthly report has a standardized structure. The tree will map directly to the CVM column names:

```text
ATIVO TOTAL (TAB_I_VL_ATIVO)
+-- 1. Disponibilidades (TAB_I1_VL_DISP)
+-- 2. Carteira (TAB_I2_VL_CARTEIRA)
|   +-- 2a. Dir. Cred. c/ Risco (TAB_I2A_VL_DIRCRED_RISCO)
|   |   +-- 2a.1 Vencidos Adimplentes (TAB_I2A1_VL_CRED_VENC_AD)
|   |   +-- 2a.2 Vencidos Inadimplentes (TAB_I2A2_VL_CRED_VENC_INAD)
|   |   +-- 2a.3 Inadimplidos (TAB_I2A3_VL_CRED_INAD)
|   |   +-- 2a.4 Performados (TAB_I2A4_VL_CRED_DIRCRED_PERFM)
|   |   +-- ... (more sub-accounts)
|   +-- 2b. Dir. Cred. s/ Risco (TAB_I2B_VL_DIRCRED_SEM_RISCO)
|   +-- 2c. Valores Mobiliarios (TAB_I2C_VL_VLMOB)
|   +-- 2d. Titulos Publicos (TAB_I2D_VL_TITPUB_FED)
|   +-- ... (CDB, Compromissadas, Cotas FIDC, etc.)
+-- 3. Derivativos (TAB_I3_VL_POSICAO_DERIV)
+-- 4. Outros Ativos (TAB_I4_VL_OUTRO_ATIVO)

PASSIVO TOTAL (TAB_III_VL_PASSIVO)
+-- A. Contas a Pagar (TAB_III_A_VL_PAGAR)
|   +-- A.1 Curto Prazo (TAB_III_A1_VL_CPRAZO)
|   +-- A.2 Longo Prazo (TAB_III_A2_VL_LPRAZO)
+-- B. Derivativos Passivo (TAB_III_B_VL_POSICAO_DERIV)

PATRIMONIO LIQUIDO (TAB_IV_A_VL_PL)
+-- PL Medio (TAB_IV_B_VL_PL_MEDIO)
```

---

### Implementation Plan

#### 1. New Backend Function: `cvm-statements`

A new edge function that:
- Fetches the CVM ZIP for the requested month(s)
- Extracts ALL value columns from Tab I, Tab III, and Tab IV for the target CNPJs
- Returns a flat map of `{ [cnpj]: { [column_name]: value } }` so the frontend can build the tree
- Supports fetching multiple months in a single request (for period-over-period)

Input:
```text
{
  "months": ["202405", "202406"],   // one or more months
  "fundType": "STANDARD"            // optional filter
}
```

Output:
```text
{
  "202405": {
    "multiplica": {
      "23216398000101": {
        "fund_name": "MULTIPLICA FIDC",
        "TAB_I_VL_ATIVO": 850000000,
        "TAB_I1_VL_DISP": 16500000,
        "TAB_I2_VL_CARTEIRA": 696000000,
        ...all columns...
      }
    },
    "red": { ... },
    ...
  },
  "202406": { ... }
}
```

#### 2. Account Tree Definition (Frontend)

A static TypeScript definition mapping CVM columns to a human-readable hierarchical tree with Portuguese labels, indentation levels, and parent-child relationships. This is defined once and reused.

#### 3. New Page: `/statements`

**Controls bar:**
- Company multi-select checkboxes (Multiplica, Red, Atena, Cifra)
- Month/Year pickers for 1-3 periods
- Toggle: "Compare Companies" vs "Compare Periods" mode
- Standard/NP fund type toggle

**Main content -- Tree Grid Table:**
- Left column: Account name with expand/collapse arrows and indentation
- Right columns: One column per company (or per period in period mode)
- Values formatted as R$ currency
- Parent rows show bold totals; child rows show detail
- Color coding: negative values in red, zero values grayed out

**Interaction:**
- Click a parent row arrow to expand/collapse children
- All parents start collapsed (showing only top-level totals)
- "Expand All" / "Collapse All" buttons

#### 4. Navigation Update

- Add "Statements" link to the Navbar
- Add route `/statements` to App.tsx

#### 5. Period-over-Period Mode

When user selects "Compare Periods" mode:
- Company selector becomes single-select
- Period selector allows picking 2-3 months
- Columns become: Account | Jan/2025 | Feb/2025 | Mar/2025
- An optional "Delta" column showing month-over-month change (absolute and %)

---

### Technical Details

**Edge Function (`supabase/functions/cvm-statements/index.ts`):**
- Reuses the same CVM ZIP fetch logic and CNPJ registry from `cvm-compare`
- Parses Tab I, Tab III, Tab IV
- Extracts every `TAB_*` column value (not just the few we currently track)
- Aggregates per-company when a company has multiple CNPJs
- Returns per-CNPJ data so frontend can show fund-level breakdown too

**Frontend Account Tree (`src/lib/account-tree.ts`):**
- Static array defining the hierarchy:
```text
[
  { id: "TAB_I_VL_ATIVO", label: "Ativo Total", level: 0, children: [...] },
  { id: "TAB_I1_VL_DISP", label: "1. Disponibilidades", level: 1, parent: "TAB_I_VL_ATIVO" },
  ...
]
```

**Tree Grid Component (`src/components/StatementTreeGrid.tsx`):**
- Uses standard HTML table with Tailwind styling
- Manages expand/collapse state via a `Set<string>` of expanded node IDs
- Renders rows recursively based on the account tree definition
- Supports both "companies as columns" and "periods as columns" modes

**Page (`src/pages/Statements.tsx`):**
- Uses TanStack Query to fetch from `cvm-statements`
- Controls for company selection, period selection, and mode toggle
- Renders the `StatementTreeGrid` component

**Files to create:**
- `supabase/functions/cvm-statements/index.ts` -- new edge function
- `src/lib/account-tree.ts` -- hierarchical account definition
- `src/components/StatementTreeGrid.tsx` -- tree grid component
- `src/pages/Statements.tsx` -- new page

**Files to modify:**
- `src/App.tsx` -- add `/statements` route
- `src/components/Navbar.tsx` -- add "Statements" nav link

