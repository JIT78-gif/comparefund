
I checked the backend path end-to-end, and here is what I found before proposing the fix:

- Your recent user-side logs show repeated browser transport failures (`Failed to fetch`) when calling `cvm-statements`.
- In those failure windows, function logs were almost empty, which means requests often did not complete into function execution.
- I tested the same backend directly and from browser automation:
  - Direct backend invocation returns `200` with valid data.
  - Browser preflight (`OPTIONS 204`) and POST (`200`) are currently succeeding on `/statements`.
  - Cache table is populated (`202411`, `202601`), and function logs now show cache hits.

This means the system is currently partially healthy, but there is still an intermittent transport/reliability gap between the UI session and backend calls. I’ll fix this as a resilience issue (not just a single line bug), so the UI remains stable even during transient network/path instability.

Implementation sequence to fix it:

1) Harden frontend invocation path so network instability does not break the page
- File: `src/pages/Statements.tsx`
- Replace current timeout logic with a real timeout mechanism:
  - Current `AbortController` is not wired into `supabase.functions.invoke`, so it does not actually enforce timeout.
  - Use `Promise.race` between invoke and a timeout promise for deterministic client-side timeout behavior.
- Add transport retry strategy:
  - Retry only for transport-level errors (`Failed to fetch`, network errors), max 1 retry.
  - Add short jittered delay before retry to avoid request storms.
- Add region failover strategy:
  - First invoke in default route.
  - On transport failure only, retry once via explicit alternate region.
- Keep and prioritize `lastGoodData` during transient failures so grid never collapses to blank state if previously loaded.

2) Strengthen backend response consistency and diagnostics
- Files:
  - `supabase/functions/cvm-statements/index.ts`
  - `supabase/functions/_shared/cors.ts`
- Add explicit request lifecycle logs in `cvm-statements`:
  - request start, months/fundType, cache hit/miss, fetch duration, response status path.
  - This will make future incidents diagnosable in minutes.
- Ensure every return path includes consistent JSON body shape and CORS headers (already mostly done, but I’ll normalize all branches).
- Add explicit, cheap health response path (e.g. `{"ping": true}`) for quick connectivity checks without CVM fetch overhead.

3) Tighten cache fallback behavior for unstable upstream conditions
- File: `supabase/functions/cvm-statements/index.ts`
- Keep current cache-first flow, but make fallback deterministic:
  - If fetch fails and stale cache exists, always return stale with `_meta[month] = "stale"`.
  - Never block response on cache write operations.
- Improve error object standardization for frontend parsing:
  - Keep machine-readable prefixes (`TIMEOUT`, `UNAVAILABLE`, `NETWORK`) and include month context consistently.
- Preserve current 55s global execution budget and per-fetch timeout behavior.

4) Improve user-facing error clarity without noisy false alarms
- File: `src/pages/Statements.tsx`
- Update error classification so users can distinguish:
  - temporary connection problem
  - month unavailable
  - request timeout
  - stale fallback active
- Keep “Try again” button but make it execute the same robust invoke path (timeout + retry + failover).

5) Verification checklist after implementation
- Functional checks:
  - `/statements` initial load
  - switch STANDARD/NP
  - switch companies/periods mode
  - 2 and 3 period comparisons
- Reliability checks:
  - confirm network shows `OPTIONS 204` + `POST 200` under normal path
  - force retry path (simulate transport error) and verify graceful fallback
  - verify stale banner appears only when `_meta` indicates stale
- Backend checks:
  - confirm logs show request start/cache/fetch/result lifecycle
  - validate response shape for success, partial stale, and all-failed cases
- Device checks:
  - desktop and mobile flow validation on `/statements`

Expected outcome:
- Even when transient network/path issues occur, users no longer see repeated hard failures.
- They either get fresh data, stale cached data with notice, or a deterministic actionable error—never silent transport ambiguity.
- Backend incidents become traceable due to request lifecycle logging.
