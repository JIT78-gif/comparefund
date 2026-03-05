

## Competitor Management Module

### Current State
Competitors and CNPJs are **hardcoded** in 3 places:
- `supabase/functions/cvm-statements/index.ts` — `CNPJS` dict + `NP_OVERRIDE` set
- `supabase/functions/cvm-compare/index.ts` — `CNPJS` dict + `NP_OVERRIDE` set  
- `src/pages/Statements.tsx` — `COMPANIES` array

### Database Schema

**Table: `competitors`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL UNIQUE | e.g. "Multiplica" |
| slug | text NOT NULL UNIQUE | e.g. "multiplica" (used as key) |
| status | text NOT NULL DEFAULT 'active' | 'active' or 'inactive' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Table: `competitor_cnpjs`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| competitor_id | uuid FK → competitors | ON DELETE CASCADE |
| cnpj | text NOT NULL UNIQUE | Raw digits, e.g. "23216398000101" |
| fund_name | text | Optional display name |
| fund_type_override | text | NULL or 'NP' (overrides auto-detection) |
| status | text NOT NULL DEFAULT 'active' | 'active' or 'inactive' |
| created_at | timestamptz | |

RLS: Public SELECT for both tables (no auth in this app). Admin writes will use service_role key via edge function.

### Edge Function: `competitor-admin`
Single edge function handling CRUD for competitors and CNPJs. Validates CNPJ format, prevents duplicates. Uses service_role key to bypass RLS for writes.

Endpoints (via `action` field in body):
- `list` — return all competitors with their CNPJs
- `add_competitor` — create new competitor
- `update_competitor` — edit name/status
- `delete_competitor` — remove competitor + cascade CNPJs
- `add_cnpj` — add CNPJ to competitor (with format validation)
- `update_cnpj` — edit CNPJ details
- `delete_cnpj` — remove CNPJ
- `bulk_import_cnpjs` — parse CSV text, validate, insert multiple

### Update Existing Edge Functions
Modify `cvm-statements` and `cvm-compare` to **read from the database** instead of hardcoded `CNPJS` dict:
```typescript
const { data } = await supabase
  .from('competitors').select('slug, competitor_cnpjs(cnpj, fund_type_override)')
  .eq('status', 'active');
// Build CNPJS dict and NP_OVERRIDE set dynamically
```

### Admin Page (`/admin`)
New page with:
- **Competitor list** — table showing name, slug, status, CNPJ count, actions (edit/delete)
- **Add Competitor** — dialog with name input, auto-generates slug
- **Expand row** — shows CNPJs for that competitor with edit/delete per row
- **Add CNPJ** — dialog with CNPJ input (masked XX.XXX.XXX/XXXX-XX), optional fund name, optional NP override
- **Bulk Import** — textarea for CSV paste (cnpj,fund_name per line)
- **Status toggle** — switch active/inactive per competitor and per CNPJ
- Simple password gate (prompt for admin password stored as secret) — no full auth system

### Update Frontend Data Flow
- `src/pages/Statements.tsx` — fetch competitors from DB instead of hardcoded `COMPANIES`
- `src/pages/Compare.tsx` — same, use dynamic competitor list

### Files to Create/Modify

| File | Action |
|------|--------|
| DB migration | Create `competitors` + `competitor_cnpjs` tables with seed data |
| `supabase/functions/competitor-admin/index.ts` | Create — CRUD edge function |
| `src/pages/Admin.tsx` | Create — admin panel UI |
| `src/App.tsx` | Add `/admin` route |
| `src/components/Navbar.tsx` | Add admin link |
| `supabase/functions/cvm-statements/index.ts` | Read competitors from DB |
| `supabase/functions/cvm-compare/index.ts` | Read competitors from DB |
| `src/pages/Statements.tsx` | Fetch companies dynamically |
| `src/pages/Compare.tsx` | Fetch companies dynamically |

### Seed Data (from current hardcoded values)
```
multiplica: 23216398000101, 40211675000102 (NP)
red: 17250006000110, 11489344000122
atena: 31904898000156
cifra: 08818152000108
sifra: 08678936000188, 17012019000150 (NP), 41351629000163, 42462120000150, 54889584000127, 14166140000149
```

