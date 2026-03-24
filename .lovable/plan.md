

## Full Migration: Supabase → Pure PostgreSQL + Express Backend

### Overview
Replace all Supabase dependencies (auth, database client, edge functions) with a standard PostgreSQL + Express.js backend so the project can run locally without any Supabase infrastructure.

**Important caveat**: Lovable is a frontend-only platform — it cannot host a persistent Node.js/Express server. This migration means the project would need to be **exported and run locally** (or deployed elsewhere). The preview in Lovable will stop working once Supabase is removed.

---

### Architecture Change

```text
CURRENT                          TARGET
───────                          ──────
React App                        React App
  ↓                                ↓
Supabase Client SDK              fetch() → Express API
  ↓                                ↓
Supabase Auth (magic link)       Express + JWT/session auth
Supabase Edge Functions (Deno)   Express routes (Node.js)
Supabase PostgREST               pg / knex direct SQL queries
```

---

### Changes Required

#### 1. New Express Backend (`server/`)
- **`server/index.ts`** — Express app with CORS, JSON parsing, routes
- **`server/db.ts`** — PostgreSQL connection pool using `pg` library
- **`server/auth.ts`** — JWT-based auth middleware (replace magic link with email/password + JWT tokens)
- **`server/routes/`** — One route file per current edge function:
  - `auth.ts` — login/register/logout endpoints
  - `competitors.ts` — CRUD for competitors/CNPJs (replaces `competitor-admin`)
  - `statements.ts` — CVM data fetching + caching (replaces `cvm-statements`)
  - `compare.ts` — CVM comparison (replaces `cvm-compare`)
  - `discover.ts` — CVM fund discovery (replaces `cvm-discover`)
  - `manager-search.ts` — Manager search (replaces `cvm-manager-search`)
  - `chat.ts` — N8N chat proxy (replaces `n8n-chat-proxy`)

#### 2. Database Setup (`server/schema.sql`)
- Export all current tables (competitors, competitor_cnpjs, profiles, user_roles, authorized_emails, statement_cache) as plain SQL CREATE statements
- Add a `users` table to replace Supabase Auth's `auth.users`
- Include password hash column (bcrypt)
- Remove RLS policies (handled in application layer instead)

#### 3. Frontend Client Replacement
- **Delete** `src/integrations/supabase/` (client.ts, types.ts)
- **New `src/lib/api.ts`** — Axios/fetch wrapper pointing to `http://localhost:3001/api`
- **Update `src/components/AuthGuard.tsx`** — Check JWT token in localStorage instead of Supabase session
- **Update `src/hooks/useIsAdmin.ts`** — Call `/api/auth/me` endpoint
- **Update `src/lib/competitors.ts`** — Use fetch to Express API
- **Update `src/lib/cvm-invoke.ts`** — Call `/api/statements` instead of `supabase.functions.invoke`
- **Update `src/components/Navbar.tsx`** — Logout via API
- **Update `src/pages/Login.tsx`** — Email/password form → POST `/api/auth/login`
- **Update `src/pages/Admin.tsx`** — All supabase queries → API calls
- **Update `src/components/RegulationChat.tsx`** — Call `/api/chat` instead of edge function
- **Update `.env`** — Replace Supabase vars with `VITE_API_URL=http://localhost:3001`

#### 4. Edge Functions → Express Routes
Convert each Deno edge function to a Node.js Express route handler:
- Replace `Deno.serve()` → Express route handler
- Replace `Deno.env.get()` → `process.env`
- Replace npm imports from `npm:` prefix → standard npm packages
- Keep the core CVM parsing logic (JSZip, CSV parsing) intact

#### 5. Local Dev Setup
- **`docker-compose.yml`** — PostgreSQL container
- **`server/package.json`** — Express, pg, bcrypt, jsonwebtoken, jszip dependencies
- **`README.md`** — Updated with local setup instructions

---

### Files to Create (15+)
| File | Purpose |
|------|---------|
| `server/index.ts` | Express entry point |
| `server/db.ts` | PostgreSQL pool |
| `server/auth.ts` | JWT middleware |
| `server/schema.sql` | Full database schema |
| `server/routes/auth.ts` | Login/register/me |
| `server/routes/competitors.ts` | Competitor CRUD |
| `server/routes/statements.ts` | CVM statements |
| `server/routes/compare.ts` | CVM compare |
| `server/routes/discover.ts` | CVM discover |
| `server/routes/manager-search.ts` | Manager search |
| `server/routes/chat.ts` | N8N proxy |
| `server/package.json` | Dependencies |
| `server/tsconfig.json` | TypeScript config |
| `docker-compose.yml` | Local PostgreSQL |
| `src/lib/api.ts` | Frontend API client |

### Files to Modify (8)
| File | Change |
|------|--------|
| `src/components/AuthGuard.tsx` | JWT token check |
| `src/hooks/useIsAdmin.ts` | API call |
| `src/lib/competitors.ts` | API calls |
| `src/lib/cvm-invoke.ts` | API calls |
| `src/components/Navbar.tsx` | API logout |
| `src/pages/Login.tsx` | Email/password form |
| `src/pages/Admin.tsx` | API calls |
| `src/components/RegulationChat.tsx` | API calls |

### Files to Delete
| File | Reason |
|------|--------|
| `src/integrations/supabase/client.ts` | Replaced by api.ts |
| `src/integrations/supabase/types.ts` | No longer needed |
| All `supabase/functions/*/index.ts` | Replaced by Express routes |

---

### Important Note
Since Lovable cannot run a persistent Express server, after this migration you will need to:
1. **Export the project** from Lovable (GitHub sync or download)
2. Run `docker-compose up` for PostgreSQL locally
3. Run `cd server && npm install && npm run dev` for the backend
4. Run `npm run dev` for the frontend (Vite)

The Lovable preview will no longer work for features requiring the backend. Would you like to proceed knowing this limitation?

