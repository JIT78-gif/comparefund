

## Add Missing Comparison Metrics

### Current State
The dashboard currently tracks 3 of the 7 required metrics:
- Patrimonio Liquido (Net Assets) -- done
- Inadimplencia (Default Rate) -- done
- Valor da Cota (Unit Variation) -- done
- Direitos Creditorios (Total Receivables) -- partially done (shown in subtitle, not as chart/card)

### Missing Metrics to Add

| Metric | CVM Source | Feasibility |
|--------|-----------|-------------|
| Direitos Creditorios (Total Receivables) | Tab II - already extracted as `portfolio` | Promote to full chart + card |
| Caixa / Disponibilidades (Cash on Hand) | Tab V - `TAB_V_A_VL_DISPONIB` or similar | New tab to parse |
| Quantidade de Cotistas (Number of Shareholders) | Tab VI - `TAB_VI_QT_COTST` or similar | New tab to parse |
| Subordinacao (Subordination Ratio) | Fund regulation document, not in monthly data | Not available from CVM monthly ZIP -- will show as "N/A" with a note |

### Changes

#### 1. Edge Function (`supabase/functions/cvm-compare/index.ts`)
- Add `tab_V` and `tab_VI` to the `targetTables` array
- Parse Tab V for cash/disponibilidades columns
- Parse Tab VI for number of shareholders (cotistas) columns
- Add `cash`, `shareholders` fields to the per-fund data and aggregated results
- Add these fields to the `FundDetail` interface and response
- Add `receivables` as explicit field (rename from `portfolio` for clarity)

#### 2. Frontend Interfaces (`src/pages/Compare.tsx`)
- Update `CompanyData` interface to include `cash`, `shareholders`
- Update `FundDetail` interface to include `cash`, `shareholders`

#### 3. New Charts (add 3 more chart cards)
Add to the chart grid (change from 3-col to 2x3 grid):
- **Total Receivables (R$)** -- uses existing `portfolio` data
- **Cash on Hand (R$)** -- new `cash` field
- **Number of Shareholders** -- new `shareholders` field

#### 4. New Metric Cards
Add rows of metric cards for:
- Total Receivables per company
- Cash on Hand per company
- Shareholders per company

#### 5. Update Data Table
Add columns: Receivables, Cash, Shareholders, and a Subordination column showing "N/A" (since this data isn't in CVM monthly reports)

#### 6. Update Fund Details cards
Add Cash and Shareholders to the detail grid for each fund

### Technical Details

**Tab V parsing** (cash):
```text
// Look for columns like TAB_V_A_VL_DISPONIB or similar cash columns
const cashIdx = header.findIndex(h => h.includes("DISPONIB") || h.includes("TAB_V"));
```

**Tab VI parsing** (shareholders):
```text
// Look for columns like TAB_VI_QT_COTST
const cotistasIdx = header.findIndex(h => h.includes("QT_COTST") || h.includes("COTISTA"));
```

**Chart layout**: Change from `lg:grid-cols-3` to `lg:grid-cols-3` with 2 rows (6 charts total), keeping consistent styling.

**Subordination note**: Since subordination comes from fund regulations (not monthly CVM data), it will be shown as "N/A" in the table with a tooltip explaining it requires manual input from regulation documents.

