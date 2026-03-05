

## Plan: Fix and Enhance All Chart Types in ChartPanel

### Problems Identified

1. **Pie chart**: Uses `Math.abs` for all values, which masks negative data; percentages are correct (Recharts auto-calculates) but tooltip doesn't show percentage; legend shows raw account IDs instead of readable labels
2. **Line/Area charts**: Data is transposed (one data point per account on X-axis), so with few accounts selected you get 1-2 points — not useful for trend analysis. Should instead show columns (periods/companies) on X-axis with one line per account
3. **All charts**: No handling for zero-value or negative-value edge cases; tooltip formatting inconsistent across chart types; no data point value labels on hover for line chart

### Changes

**File: `src/components/ChartPanel.tsx`** (full rewrite of chart logic)

1. **Fix Line/Area chart orientation**: Remove the "transposed" data approach. All cartesian charts (bar, line, area) use the same data structure — columns on X-axis, one series per selected account. This ensures line/area charts always have multiple data points when comparing multiple periods or companies.

2. **Fix Pie chart**:
   - Filter out zero-value slices to avoid empty segments
   - Use absolute values but indicate negative in tooltip with sign
   - Add percentage to tooltip (e.g., "R$ 500M (32%)")
   - Fix legend to show readable account labels via `nameKey="name"`
   - Handle edge case: if all values are zero, show "No data" message

3. **Enhance Line chart**:
   - Add `activeDot={{ r: 6 }}` for better hover interaction
   - Add `label` prop to show values on data points when ≤ 3 series selected
   - Add `connectNulls` to handle missing data gracefully

4. **Handle edge cases across all charts**:
   - Zero values: show as 0 in tooltip, skip in pie chart
   - Negative values: render correctly in bar/line/area (they already support negative), format with minus sign in tooltip
   - Single data point: show a message suggesting adding more periods/companies for line/area charts

5. **Improve CustomTooltip**: Unify formatting — always show the account label, properly format currency/rate/quantity based on account type, show percentage for pie chart entries.

### Technical Details

```text
// Unified data structure for all cartesian charts:
// X-axis = columns (companies or periods)
// Series = selected accounts
const chartData = columns.map(col => {
  const row = { name: col.label };
  for (const accId of accountIds) {
    row[accId] = getValue(col.key, accId);
  }
  return row;
});

// Pie: filter zero slices, show "no data" if empty
const pieData = accountIds
  .map((accId, i) => {
    let total = 0;
    for (const col of columns) total += Math.abs(getValue(col.key, accId));
    return { name: labelMap.get(accId) || accId, value: total, fill: PALETTE[i % PALETTE.length] };
  })
  .filter(d => d.value > 0);
```

### Implementation Order
1. Fix data orientation for line/area (remove transposed logic)
2. Fix pie chart (filter zeros, improve labels/tooltip)
3. Add line chart enhancements (active dot, labels)
4. Add edge case handling and "insufficient data" messages

