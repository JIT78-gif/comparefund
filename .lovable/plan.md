
I investigated your current setup and the latest telemetry before proposing changes.

What I verified:
- Your Statements page currently calls the backend function correctly, and the request payload is valid (`months`, `fundType`).
- In your failing sessions, requests show **status 0 / Failed to fetch** repeatedly.
- In a fresh preview run, the same endpoint returned **200** in ~7.6s and the table loaded correctly.
- Backend function logs are almost empty during failure windows, which strongly suggests an intermittent transport/runtime path issue (request not completing back to browser), not a permanent syntax/config break.
- The backend still does expensive live CVM fetch + ZIP parse on demand for each request and processes months in a way that can still spike latency.

This points to an intermittent reliability issue, not a single fixed bug line. To eliminate recurrence, I’ll shift the flow from “always live fetch” to “cache-first + bounded execution + client fallback”.

Implementation sequence (high-confidence fix):

1) Add a persistent monthly cache in the backend database (Lovable Cloud)
- Create a cache table for statement payloads keyed by:
  - `ref_month` (YYYYMM)
  - `fund_type` (STANDARD/NP)
- Store:
  - parsed JSON payload
  - `fetched_at`
  - `expires_at`
  - `source_status` (fresh/stale/error)
  - optional diagnostics (duration/error code)
- Add unique index on `(ref_month, fund_type)`.
- Add RLS policies:
  - public read (safe because this is public market data)
  - writes only from backend function role (not browser clients)

Why: once a month/fund type is cached, UI loads in milliseconds and avoids repeated upstream ZIP parsing.

2) Refactor `cvm-statements` backend function to cache-first + strict time budgets
- File: `supabase/functions/cvm-statements/index.ts`
- New behavior:
  1. Check cache for each requested month/fundType.
  2. Return cache immediately when valid.
  3. For misses, fetch/parse with strict bounded timeouts.
  4. If upstream fails but stale cache exists, return stale cache with `_meta.stale = true`.
  5. If no cache and upstream fails, return structured JSON error (never raw transport ambiguity).
- Add a global execution budget for the request so response always returns before proxy/runtime hard-kill windows.
- Process multi-month requests with controlled parallelism (avoid sequential long chains and avoid memory spikes).
- Keep CORS headers on all response paths.

Why: prevents long-running “hang then status 0” behavior and gives predictable JSON outcomes.

3) Harden frontend invoke path with timeout + region fallback + clearer error source
- File: `src/pages/Statements.tsx`
- Replace direct single invoke call with helper flow:
  - attempt 1: invoke with explicit timeout
  - attempt 2 (only on transport failure): retry once with alternate region routing
  - preserve existing `lastGoodData` behavior
- Keep retry conservative (max 1) to avoid storms.
- Improve error display logic:
  - distinguish timeout vs unavailable vs stale-fallback
  - if stale cache is shown, display “showing last available data” notice
- Keep “Try again” button and make it use the same helper path.

Why: even if one route is flaky, UI has deterministic fallback and user-readable state.

4) Optional but recommended: reduce accidental request churn on control changes
- Add small debounce (e.g., 300–500ms) before query executes after month/fund toggles.
- Ensure only meaningful state changes trigger refetch.

Why: reduces repeated expensive requests while users are adjusting controls.

5) Verification plan (end-to-end, desktop + mobile)
- Desktop `/statements`
  - initial load
  - switch Standard/NP
  - switch company/period modes
  - two/three-period comparison
- Mobile `/statements`
  - open from mobile nav
  - change controls and validate data refresh
- Network validation
  - confirm backend requests complete with HTTP response (no recurrent status 0 loops)
  - verify stale-cache path returns JSON with marker when upstream fails
- Backend validation
  - request known good month (202411/202412)
  - request problematic month and confirm graceful JSON fallback
- Regression check
  - ensure StatementTreeGrid still renders correctly with cached payload shape

Technical notes and trade-offs:
- This plan intentionally favors reliability over “always live fresh” on every request.
- Monthly CVM data is naturally coarse-grained, so cache TTL (e.g., 12–24h) is low-risk and high-value.
- Structured stale fallback eliminates blank/error-only states while preserving transparency in UI.
- No changes needed to generated integration files; all updates stay in app page + backend function + migration.

Acceptance criteria:
- Statements page no longer repeatedly fails with “Failed to send request” during normal use.
- When upstream CVM is slow/unavailable, users still get either:
  - cached/stale data with clear notice, or
  - explicit JSON-backed error with actionable message.
- Works consistently on desktop and mobile with predictable retry behavior.
