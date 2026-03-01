

## Problem

The current chart always puts **columns (companies)** on the X-axis and creates one series per **selected account**. This works for bar charts but makes no sense for line charts -- connecting categorical company names with a line is meaningless (as shown in the screenshot: a single curved line from Multiplica to Red to Sifra).

## Fix: Transpose data for Line and Area charts

For **line** and **area** charts, swap the axes:
- **X-axis** = selected accounts (e.g., "1.1 - Disponibilidades", "1.2 - Carteira")
- **One line/area per column** (one per company in "Compare Companies" mode, one per period in "Compare Periods" mode)
- Each company gets its own colored line, making it easy to compare across accounts

For **bar** charts, keep the current layout (companies on X-axis, grouped bars per account) since grouped bars work well with categorical data.

### Changes in `src/components/ChartPanel.tsx`

1. Add a **transposed dataset** (`chartDataTransposed`) where each row is an account and each series key is a column (company/period)
2. In `renderCartesian`, use the transposed data when `chartType` is `"line"` or `"area"`
3. Update the Legend formatter and Tooltip to show column labels (company names) instead of account IDs when transposed
4. Update the Y-axis `tickFormatter` accordingly

