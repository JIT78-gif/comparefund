

## Fix NP Toggle and Chart Display Issues

### Problem 1: Charts showing 4 identical bars per company
The `chartData` maps each company to a separate data point (row), but then 4 `Bar` components are rendered, all using the same `dataKey` (e.g., `"assets"`). This produces 4 identical bars per company group. The fix is to use a single `Bar` component and color each bar based on the company.

### Problem 2: NP toggle doesn't change data
When switching to NP, the edge function filters by `fund_type === "NP"`. However, since Atena and Cifra only have Standard CNPJs and Multiplica/Red's fund type classification may not be working reliably, NP returns either zero or the same data. The fix involves verifying the fund type detection logic and ensuring NP data is correctly filtered.

---

### Changes

#### 1. Fix charts in `src/pages/Compare.tsx`
- Remove the `COMPANIES.map()` that creates multiple `Bar` components per chart
- Use a single `Bar` with a custom `Cell` component that assigns each bar its company-specific color
- This way each company gets exactly one bar with its correct color

#### 2. Fix NP filtering in `supabase/functions/cvm-compare/index.ts`
- Add debug logging to show what fund types are detected for each CNPJ
- Verify the NP_OVERRIDE set includes the correct NP CNPJs for Red (`11489344000122`)
- Ensure that when fundType="NP" is requested, only NP-classified funds are included in results
- If Multiplica NP CNPJ `40211675000102` and Red NP CNPJ `11489344000122` aren't being found in the data, log that clearly

#### 3. Frontend: Show only companies with data
- When NP is selected and Atena/Cifra have no NP funds, filter them out of charts and cards (or show them as "No NP fund" gracefully) so the display isn't cluttered with zero-value entries

### Technical Details

**Chart fix** (`Compare.tsx`):
Replace the chart `Bar` mapping from:
```text
{COMPANIES.map((c) => (
  <Bar key={c.key} dataKey="assets" fill={c.chartColor} ... />
))}
```
To a single Bar with Cell-based coloring:
```text
<Bar dataKey="assets" radius={[3, 3, 0, 0]}>
  {chartData.map((entry, index) => (
    <Cell key={index} fill={COMPANIES[index].chartColor} />
  ))}
</Bar>
```

**Edge function** (`cvm-compare/index.ts`):
- Add `11489344000122` to NP_OVERRIDE if Red's NP fund isn't auto-detected
- Ensure fund type detection logs are clear for debugging
- Deploy and verify with NP request

