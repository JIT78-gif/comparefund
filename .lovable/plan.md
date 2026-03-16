

## Plan: Latest-Only Regulations + Chat on All Pages

### Change 1 — Limit search to only the latest regulation per competitor

Modify the `search_regulations` SQL function to join only the **most recent** document per competitor (by `created_at`). This way, even though older docs exist in the database, the chat only uses the latest one.

**Migration SQL:**
- Use a CTE or subquery: `SELECT DISTINCT ON (competitor_id) id FROM regulation_documents WHERE status='ready' ORDER BY competitor_id, created_at DESC`
- Filter `regulation_chunks` to only those belonging to the latest document per competitor

### Change 2 — Move RegulationChat to App.tsx (visible on all pages)

Currently `RegulationChat` is only rendered inside `Compare.tsx`. The fix:

- **`src/App.tsx`** — Import `RegulationChat` and render it outside the `<Routes>` block but inside `<BrowserRouter>` (so it appears on every page). It will fetch its own competitor list internally.
- **`src/components/RegulationChat.tsx`** — Make competitors self-loading: remove the `competitors` prop, add a `useQuery` to fetch competitors from the database directly. This makes the component standalone.
- **`src/pages/Compare.tsx`** — Remove the `RegulationChat` import and usage.

### Files to modify
| File | Change |
|------|--------|
| New migration SQL | Update `search_regulations` to only search chunks from latest doc per competitor |
| `src/components/RegulationChat.tsx` | Remove `competitors` prop, self-fetch competitors via `useQuery` |
| `src/App.tsx` | Add `RegulationChat` alongside routes |
| `src/pages/Compare.tsx` | Remove `RegulationChat` usage |

