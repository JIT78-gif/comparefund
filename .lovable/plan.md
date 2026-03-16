

## Fix: Virtual Parent Nodes Showing "—" + Font Update + Navbar Fix

### Problem
The data in the database is correct (verified Multiplica Dec 2025: `TAB_I_VL_ATIVO` = R$ 1.68B, `TAB_IV_A_VL_PL` = R$ 1.67B, etc.). The bug is in `StatementTreeGrid.tsx` line 214:

```typescript
const isVirtual = account.id.startsWith("_");
const value = isVirtual ? 0 : getValue(col.key, account.id);
```

All parent nodes with IDs starting with `_` (Tab IV Patrimônio Líquido, Tab V, VI, VII, IX, X and their sub-groups like `_TAB_VII_A`, `_TAB_X_SCR_DEV`, etc.) are **hardcoded to zero** — so entire sections show "—" even though their children have real data.

### Changes

**1. `src/lib/account-tree.ts`** — Export a helper to get direct children IDs of a node
- Add `getDirectChildIds(tree, parentId)` function that returns the immediate children IDs for a given virtual parent

**2. `src/components/StatementTreeGrid.tsx`** — Aggregate children for virtual parents
- For virtual nodes (`id.startsWith("_")`), compute the sum of immediate children's values using `getValue`
- For rate columns (Tab IX), compute average instead of sum
- Pass the tree structure to look up children

**3. `src/components/Navbar.tsx`** — Add missing nav link
- Add `{ path: "/statements", label: "DEMONSTRAÇÕES" }` to the links array
- Rename "HOME" to "DASHBOARD"

**4. `src/index.css`** — Switch body font
- Change `font-family: 'DM Mono', monospace` to `font-family: 'Inter', sans-serif` on `body`
- Keep `font-mono` utility class for numeric table cells only

### Files
- `src/lib/account-tree.ts` — add child lookup helper
- `src/components/StatementTreeGrid.tsx` — aggregate virtual parent values
- `src/components/Navbar.tsx` — add DEMONSTRAÇÕES link
- `src/index.css` — change body font to Inter

