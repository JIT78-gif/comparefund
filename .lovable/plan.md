

## Email-Based Authentication with Magic Links & Admin Whitelist

### Overview
Replace the current password-based admin gate with Supabase Auth magic links. **All pages** will require authentication. Only whitelisted emails can access the app.

### Database Changes

**Table: `authorized_emails`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | text NOT NULL UNIQUE | Lowercased |
| status | text NOT NULL DEFAULT 'active' | 'active' or 'inactive' |
| added_by | uuid nullable | References auth.users(id) |
| created_at | timestamptz | |

RLS: SELECT for authenticated users. INSERT/UPDATE/DELETE restricted to admin role.

**Table: `user_roles`** (per security guidelines)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | References auth.users(id) ON DELETE CASCADE |
| role | app_role NOT NULL | Enum: 'admin', 'user' |
| UNIQUE(user_id, role) | | |

Security definer function `has_role(user_id, role)` for RLS policies.

### Edge Function: `auth-guard`
- Called during magic link sign-in flow
- Checks if the email exists in `authorized_emails` with status='active'
- If not whitelisted, returns error (prevents unauthorized access)

### Auth Flow
1. User visits any page → redirected to `/login` if no session
2. User enters email on login page
3. Backend checks email against `authorized_emails` table before sending magic link
4. User clicks link in email → session created → redirected to `/`
5. Session persists 24 hours, auto-refresh enabled

### File Changes

| File | Action |
|------|--------|
| DB migration | Create `authorized_emails`, `user_roles` tables, `app_role` enum, `has_role()` function, seed initial admin email |
| `supabase/functions/magic-link-login/index.ts` | **Create** — validates email against whitelist, then calls `supabase.auth.admin.generateLink()` to send magic link |
| `src/pages/Login.tsx` | **Create** — email input, "Send magic link" button, success/error states |
| `src/components/AuthGuard.tsx` | **Create** — wrapper component checking auth session, redirects to `/login` if unauthenticated |
| `src/App.tsx` | Wrap all routes (except `/login`) with AuthGuard |
| `src/pages/Admin.tsx` | Remove password gate, add "Authorized Emails" management section (add/remove/toggle emails), keep competitor management |
| `src/components/Navbar.tsx` | Add logout button, conditionally show ADMIN link only for admin role users |
| `src/lib/competitors.ts` | Update `invokeCompetitorAdmin` to use auth token instead of password |
| `supabase/functions/competitor-admin/index.ts` | Replace password check with JWT auth validation (check `has_role` for admin) |

### Security
- Magic link tokens expire after 1 hour (Supabase default)
- Email whitelist checked server-side before sending link
- All write operations require admin role via RLS + edge function JWT validation
- No client-side role checks — all enforced via database policies and server-side functions

