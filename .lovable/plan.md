

## Fix Chart Tooltip Text Visibility

### Problem
The tooltip popup on chart bars shows text that is not readable. The `contentStyle` sets the background dark and adds a `color` property, but Recharts applies separate styling to the label (company name) and the item text (value). The `itemStyle` prop is missing, so the formatted value text defaults to a dark/invisible color.

### Solution
Add `itemStyle={{ color: "hsl(225 30% 93%)" }}` to all three `<Tooltip>` components so the data values (e.g., "R$ 871M") are rendered in light text matching the label.

### Technical Details

In `src/pages/Compare.tsx`, update all three Tooltip components (lines ~232, ~246, ~260) to include:

```text
<Tooltip
  contentStyle={tooltipStyle}
  labelStyle={{ color: "hsl(225 30% 93%)" }}
  itemStyle={{ color: "hsl(225 30% 93%)" }}
  formatter={...}
/>
```

This applies to:
1. Total Assets chart
2. Delinquency Rate chart  
3. Unit Variation chart

