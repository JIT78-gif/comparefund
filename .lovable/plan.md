
Goal: eliminate the recurring “Failed to send a request to the Edge Function” error on the Statements page, then re-test end-to-end and keep iterating until the flow is stable on both desktop and mobile.

What I found from debugging:
- The frontend is sending valid requests to the backend function (`/functions/v1/cvm-statements`) with correct headers.
- CORS preflight succeeds (204 with expected allow headers/methods).
- Direct backend function calls return 200 with valid data for `202411` and `202412`.
- In the failing user sessions, requests appear as network-level “Failed to fetch”, not clean JSON errors.
- The current backend timeout for the CVM download is set to 120s, which is risky because runtime limits can terminate execution before a response is sent, causing the exact client-side network failure text you’re seeing.

Do I know what the issue is?
- Yes: the function can be terminated before returning (especially under slow upstream CVM responses), which surfaces to the browser as “Failed to send request” instead of a normal backend error response.

Implementation plan:

1) Harden backend function response behavior (primary fix)
- File: `supabase/functions/cvm-statements/index.ts`
- Change upstream fetch timeout from 120000ms to a safe value below runtime limits (55s).
- Ensure every failure path returns a structured JSON error quickly (with month and reason), instead of risking silent runtime termination.
- Add explicit guardrails per month so one problematic month does not create ambiguous client failures.
- Keep CORS headers on all responses unchanged.

2) Make Statements frontend request path more resilient
- File: `src/pages/Statements.tsx`
- Replace generic invoke error surfacing with a robust request helper:
  - classify network timeout vs unavailable month vs backend error,
  - preserve last successful data while new request is running,
  - expose clear, human-readable UI message (not raw transport text).
- Add a visible “Try again” action in the error block to refetch without forcing page reload.
- Keep retry strategy conservative to avoid request storms.

3) Stabilize month defaults/fallback behavior
- Keep a known-good default month on first load.
- If selected month is unavailable/slow, show actionable hint (e.g., try previous month) instead of generic failure message.
- Do not auto-loop through months; keep behavior predictable and user-controlled.

4) Verify mobile and desktop end-to-end after fixes
- Desktop `/statements`:
  - load in Compare Companies mode,
  - switch fund type STANDARD/NP,
  - change month/year and confirm data refresh.
- Mobile viewport `/statements`:
  - open via mobile nav,
  - verify controls wrap correctly and request still succeeds,
  - verify no blocked interactions.
- Network verification:
  - confirm POST requests complete with normal status responses (not “Failed to fetch”).
- Backend verification:
  - call function for `202412` and `202411`,
  - test a failure case month to confirm graceful JSON error (not transport failure).

5) Secondary cleanup (non-blocking but useful)
- Investigate and remove the “Function components cannot be given refs” warnings seen in console (MonthYearPicker / StatementTreeGrid paths), since these warnings can hide important runtime logs during future debugging.

Acceptance criteria:
- Statements page loads data consistently without “Failed to send request” transport errors.
- On slow/unavailable upstream data, user sees a clear error message and retry option.
- Same behavior works on desktop and mobile.
- Network panel shows completed requests or explicit backend JSON errors (no silent connection failures).
