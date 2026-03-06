

## Fix: Query key mismatch prevents cache invalidation

### Problem
The Admin page invalidates React Query key `["statements"]`, but the Statements page uses `["cvm-statements", months, fundType]`. These don't match, so the frontend never refetches after an admin change — it keeps showing stale React Query cached data even though the database cache was correctly purged.

### Solution
In `src/pages/Admin.tsx`, change the invalidation to match the actual query key prefix:

```typescript
queryClient.invalidateQueries({ queryKey: ["cvm-statements"] });
```

This will invalidate all queries starting with `"cvm-statements"` regardless of the `months` and `fundType` parameters.

### Scope
- **Single file change**: `src/pages/Admin.tsx` line 98 — fix the query key from `"statements"` to `"cvm-statements"`

