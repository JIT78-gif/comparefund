

## Fix: Expand Year Range in Statements Dropdown

### Problem
Line 17 of `src/pages/Statements.tsx` limits years to 2019–2026. CVM data exists from 2013 onwards.

### Change
**`src/pages/Statements.tsx` line 17** — Update the `YEARS` constant:

```typescript
// Before
const YEARS = Array.from({ length: 8 }, (_, i) => String(2019 + i));

// After
const YEARS = Array.from({ length: 15 }, (_, i) => String(2013 + i));
```

This expands the dropdown to show years 2013–2027.

### Files
| File | Change |
|---|---|
| `src/pages/Statements.tsx` | Expand `YEARS` range from 2013–2027 |

