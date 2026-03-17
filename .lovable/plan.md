

## Plan: Remove "Demonstrações" Nav Tab + Fix Encoding in Compare

### Issue 1 — Remove "Demonstrações" from navbar
The Statements link (`/statements`) currently shows in the nav. Remove it from the `links` array in `Navbar.tsx`. The `/statements` route redirects to `/` anyway.

**File: `src/components/Navbar.tsx` (line 18)**
- Remove `{ path: "/statements", label: t("nav.statements").toUpperCase() }` from the links array.

### Issue 2 — Fix `?` characters in fund names (e.g. "CREDIT�RIOS")
CVM CSV files are encoded in Latin-1 (ISO-8859-1), but the code reads them as UTF-8 via `file.async("text")`. Characters like `Ó`, `Ã`, `É` get corrupted.

**File: `supabase/functions/cvm-compare/index.ts` (line 77)**
- Change `parseCsvFile` to read bytes first with `file.async("uint8array")`, then decode with `new TextDecoder("latin1")`.

```typescript
async function parseCsvFile(file: JSZip.JSZipObject): Promise<ParsedTable> {
  const bytes = await file.async("uint8array");
  const text = new TextDecoder("latin1").decode(bytes);
  // ... rest unchanged
}
```

Same fix needed for any other `.text()` calls on fetched CVM data (lines ~293, ~315 where `medidasRes.text()` and `histRes.text()` are called). Those fetch responses also need Latin-1 decoding:
```typescript
const buf = await medidasRes.arrayBuffer();
const medidasText = new TextDecoder("latin1").decode(buf);
```

**Redeploy** the `cvm-compare` edge function after changes.

### Files to modify
| File | Change |
|------|--------|
| `src/components/Navbar.tsx` | Remove statements link from nav |
| `supabase/functions/cvm-compare/index.ts` | Decode CSVs as Latin-1 instead of UTF-8 |

