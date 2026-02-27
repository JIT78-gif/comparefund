

## Current State vs Target

**Current**: 78 accounts (Tabs I, II, III, IV, VII partial)
**Target**: 471 accounts (all 10 tabs from the CVM FIDC report)

**Missing entirely**:
- Tab V — Comportamento da Carteira c/ Risco (aging buckets: 10 maturity + 10 overdue + 10 prepaid + totals = 34 accounts)
- Tab VI — Comportamento da Carteira s/ Risco (same structure as Tab V = 34 accounts)
- Tab IX — Taxas Praticadas (discount rates + interest rates for buy/sell across 6 asset classes = 113 accounts)
- Tab X — Outras Informações (shareholder counts, unit values, captures, redemptions, amortizations, liquidity, benchmarks, guarantees, SCR ratings = 147 accounts)

**Missing sub-accounts in existing tabs**:
- Tab I: ~25 missing (a.6-a.9 recovery/judicial credits, b.6-b.9, c.1-c.4 debentures/CRI/promissory/LF, c.6 others, g/h/i warrants/provisions, derivatives b-f)
- Tab II: ~14 missing (c.3 leasing, d.4 entertainment, f.3-f.7 corporate/middle/vehicles/imob, g-i.4 cards/factoring/public sector sub-items)
- Tab III: ~4 missing (b.2-b.4 options/futures/swaps)
- Tab VII: ~16 missing (a.4 parcelas inadimplentes, b alienações with b.1-b.3 sub-items, c substituições detail)

## Problem: Unknown Column Names

The CVM CSV column names (e.g. `TAB_V_A1_VL_...`) are not documented. We only know the patterns for tabs we already parse. We need to **discover** the actual column headers before we can build the tree.

## Plan

### Step 1: Build a column discovery endpoint
Add a `discover` mode to the `cvm-statements` edge function that:
- Downloads one month's ZIP
- Opens ALL CSV files (not just I-VII)
- Returns every unique `TAB_*` column name found, grouped by source file
- This gives us the exact column names for tabs V, VI, IX, X

### Step 2: Run discovery and map columns
- Call the discovery endpoint for a recent month (e.g. 202501)
- Map each CVM column name to the PDF's account hierarchy
- Build the complete 471-account tree

### Step 3: Update the edge function to parse all tabs
- Remove the tab filter so ALL `tab_*.csv` files are processed
- Keep the existing filter for non-financial columns (CPF/CNPJ/PR_CEDENTE)
- Add new exclusions for text-based columns that aren't numeric values

### Step 4: Rebuild account-tree.ts with all 471 accounts
- Organized into sections matching the PDF structure
- Proper hierarchical codes
- Portuguese labels matching the official CVM terminology

### Step 5: Update StatementTreeGrid
- Expand the `QT_COLUMNS` set for Tab X quantity columns (shareholder counts, share quantities)
- Add rate formatting for Tab IX (percentage columns instead of R$)
- Consider adding a tab/section filter in the UI since 471 rows is very long

### Step 6: Clear cache and redeploy
- Clear statement_cache to force re-ingestion with new columns
- Deploy updated edge function

## Technical Considerations
- The cached payload size will grow significantly (~6x more columns per fund)
- Tab X data is per-subclass (senior/subordinated/mezzanine), which may require different handling since the CSV structure could use different row groupings
- Tab IX values are percentages (rates), not currency — need a third format type beyond R$ and quantity

