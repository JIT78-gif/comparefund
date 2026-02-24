

## Fix: Add Direct Database Fallback for Statement Data

### Root Cause
The backend function works correctly (confirmed with direct test call returning 200 with data for 202411). The "Failed to fetch" errors occur at the browser transport layer - the request never reaches the function or the response never makes it back. This is an intermittent infrastructure issue, not a code bug.

### Solution: Direct Database Cache Fallback
Since we already have a `statement_cache` table with valid cached data, we can read it directly via the database client when the edge function fails. This completely bypasses the edge function transport path for cached months.

### Changes

**1. Update `src/lib/cvm-invoke.ts`**
- Add a new `readCacheDirect()` function that queries `statement_cache` table directly using the Supabase client
- Modify `invokeStatements()` flow:
  1. Try edge function call (with timeout + 1 retry as today)
  2. If that fails, try reading directly from `statement_cache` table
  3. If cache has data, return it with `_meta` marking months as "stale"
  4. Only throw if both paths fail
- This direct DB read is fast (milliseconds) and does not go through the edge function proxy

**2. Update `src/pages/Statements.tsx`**
- Fix the "Try again" button text (currently showing raw translation key `statements.tryAgain`)
- Keep existing error display and stale data banner logic (already works correctly with `_meta`)

### Why This Works
- The `statement_cache` table already has RLS allowing public reads
- Reading from the database uses a different network path than edge function invocation
- Cached data for 202411/STANDARD is already present and valid
- Users get data immediately even when edge function transport is flaky
- The stale data banner correctly informs users when they're seeing cached data

### Technical Details

The `readCacheDirect` function will:
```text
1. Query: SELECT parsed_payload, source_status, expires_at 
   FROM statement_cache 
   WHERE ref_month = ? AND fund_type = ?
2. Return the parsed_payload if found (regardless of expiry)
3. Mark as "stale" if expired, "cached" if fresh
```

The updated `invokeStatements` flow:
```text
try edge function (with timeout + retry)
  -> success: return data
  -> fail: try readCacheDirect for each month
    -> any data found: return assembled result with _meta stale markers
    -> no cache: throw original error
```

