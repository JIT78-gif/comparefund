

## Clean Up Compare Page UI + Fix Standard/NP Type

### Problems Identified
1. The Standard/NP toggle does nothing -- the edge function ignores fund type entirely
2. The UI is missing key elements shown in the reference: a rich data table with Type column, Fund Details section with raw CVM data, and a Unit Variation chart
3. The current layout needs polish to match the reference screenshots

### Changes

#### 1. Edge Function (`supabase/functions/cvm-compare/index.ts`)
- Return additional fields: `fund_name`, `liabilities`, and `fund_type` for each company
- Parse fund names from the CSV data (tab_IV has fund identification)
- Extract liabilities data from the relevant table
- Return a `details` array with per-fund raw data (name, CNPJ, period, net_assets, portfolio, liabilities, overdue) for the Fund Details section

#### 2. Compare Page (`src/pages/Compare.tsx`) -- Full UI Redesign
Based on the reference screenshots:

**Metric Cards (top row):** Keep the 4 cards but ensure they show correct data with proper icons:
- Multiplica PL (green dot icon)
- Red PL (red/orange dot icon)  
- Multiplica Delinq. (chart icon)
- Red Delinq. (chart icon)

**Charts section:** Expand from 2 to 3 charts in a row:
- Total Assets (B) -- bar chart
- Delinquency Rate (%) -- bar chart
- Unit Variation (%) -- bar chart (new)

**Data Table:** Replace current simple table with a richer one matching the reference:
- Columns: Company (with colored dot), Assets, # Funds, Delinquency %, Unit Var %, Type (pill badge)
- Color-coded delinquency pills (green for low values)
- Type shown as a styled pill/badge ("STANDARD" or "NP")

**Fund Details section (new):** Add a "FUND DETAILS -- RAW CVM DATA" section below the table:
- Card per fund showing: full fund name, CNPJ, period
- 4 metrics in a row: Net Assets (PL), Portfolio, Liabilities, Overdue
- Values in green for assets/portfolio, orange for liabilities

**Standard/NP toggle:** Wire it to actually filter data -- pass `fundType` to the edge function so it can return the correct fund classification. Since each CNPJ may only be one type, the toggle will filter which funds to show.

#### 3. MetricCard Component
- Minor cleanup if needed, but largely stays the same

### Technical Details

- The edge function will be updated to accept an optional `fundType` parameter and return enriched data including `fund_name`, `liabilities`, and per-fund details
- The response shape changes to include a `details` array alongside the aggregated metrics
- The frontend `queryKey` will include `fundType` so switching types triggers a refetch
- Charts will use a 3-column grid on desktop
- The data table and fund details section use the existing design system colors and typography

