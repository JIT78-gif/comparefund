

## Plan: Invalidate statement cache when admin adds/removes funds

### Problem
When an admin adds or removes a CNPJ in the Admin panel, the `statement_cache` table still holds stale parsed data. The `cvm-statements` function serves cached results that don't reflect the updated competitor list — so new funds don't appear and removed funds persist.

### Solution
Invalidate all cached statement data whenever a CNPJ is added or removed. Two changes:

**1. Edge function (`supabase/functions/competitor-admin/index.ts`)**

After any successful `add_cnpj` or `remove_cnpj` action, delete all rows from `statement_cache`. This forces the next data request to re-fetch and re-parse from CVM with the updated competitor list.

```typescript
// After successful add/remove CNPJ:
await supabaseAdmin.from("statement_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000");
```

**2. Frontend cache invalidation (`src/pages/Statements.tsx` or wherever admin actions are called)**

After an admin adds/removes a CNPJ in the Admin page, invalidate the React Query cache for statements so the UI refetches fresh data on next visit.

In `src/pages/Admin.tsx`, after successful CNPJ mutations, call `queryClient.invalidateQueries({ queryKey: ["statements"] })`.

### Scope
- `supabase/functions/competitor-admin/index.ts` — add cache purge after `add_cnpj` and `remove_cnpj`
- `src/pages/Admin.tsx` — invalidate React Query statements cache after CNPJ changes

