/**
 * One-time migration script: copies competitor data from Supabase → local PostgreSQL.
 *
 * Before running:
 *   1. Open https://supabase.com/dashboard/project/shdmcrozknktngheopik/settings/api
 *   2. Copy the "service_role" key
 *   3. Add to server/.env:  SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Run from the server/ directory:
 *   npm run migrate-supabase
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

// ── Env file parser ──────────────────────────────────────────────────────────
function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, "utf8");
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

// Load env: server/.env and root .env
const serverEnv = parseEnvFile(resolve(import.meta.dirname, "../.env"));
const rootEnv   = parseEnvFile(resolve(import.meta.dirname, "../../.env"));

const SUPABASE_URL = rootEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY     = rootEnv.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY  = serverEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = serverEnv.DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fidc_intel";

const SUPABASE_KEY = SERVICE_KEY || ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: Missing Supabase credentials.");
  console.error("  VITE_SUPABASE_URL  →", SUPABASE_URL || "NOT FOUND (check root .env)");
  console.error("  SUPABASE_KEY       →", SUPABASE_KEY ? "found" : "NOT FOUND");
  process.exit(1);
}

console.log(`Supabase project: ${SUPABASE_URL}`);
console.log(`Using key type  : ${SERVICE_KEY ? "service_role (full access)" : "anon (may fail if RLS is enabled)"}`);
console.log(`Local DB        : ${DATABASE_URL.replace(/:\/\/[^@]+@/, "://<credentials>@")}\n`);

// ── Supabase REST fetch helper ───────────────────────────────────────────────
async function supabaseFetch(table: string, query = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase fetch failed for "${table}": HTTP ${res.status}\n${body}`);
  }
  return JSON.parse(body);
}

// ── Main migration ───────────────────────────────────────────────────────────
async function main() {
  // 1. Fetch competitors with their CNPJs from Supabase
  console.log("Fetching competitors from Supabase...");
  const competitors: any[] = await supabaseFetch("competitors", "select=*,competitor_cnpjs(*)&order=created_at.asc");

  if (!Array.isArray(competitors) || competitors.length === 0) {
    console.warn("No competitors returned from Supabase.");
    if (!SERVICE_KEY) {
      console.error("\nThis is likely because RLS is blocking the anon key.");
      console.error("Please add the service_role key to server/.env:");
      console.error("  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n");
      console.error("Get it from: https://supabase.com/dashboard/project/shdmcrozknktngheopik/settings/api");
    }
    process.exit(1);
  }

  console.log(`Fetched ${competitors.length} competitor(s) from Supabase:\n`);
  for (const c of competitors) {
    console.log(`  • ${c.name} (slug: ${c.slug}) — ${(c.competitor_cnpjs || []).length} CNPJ(s)`);
  }

  // 2. Fetch authorized_emails from Supabase
  console.log("\nFetching authorized_emails from Supabase...");
  let authorizedEmails: any[] = [];
  try {
    authorizedEmails = await supabaseFetch("authorized_emails", "select=*&order=created_at.asc");
    console.log(`Fetched ${authorizedEmails.length} authorized email(s)`);
  } catch (e: any) {
    console.warn("Could not fetch authorized_emails (skipping):", e.message);
  }

  // 3. Write to local PostgreSQL
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Clear stale data
    await client.query("DELETE FROM statement_cache");
    await client.query("DELETE FROM competitor_cnpjs");
    await client.query("DELETE FROM competitors");
    console.log("\nCleared local tables (competitors, competitor_cnpjs, statement_cache)");

    // Insert competitors
    for (const comp of competitors) {
      await client.query(
        `INSERT INTO competitors (id, name, slug, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name=$2, slug=$3, status=$4, updated_at=$6`,
        [comp.id, comp.name, comp.slug, comp.status || "active", comp.created_at, comp.updated_at || comp.created_at]
      );

      const cnpjs: any[] = comp.competitor_cnpjs || [];
      for (const cnpj of cnpjs) {
        await client.query(
          `INSERT INTO competitor_cnpjs (id, competitor_id, cnpj, fund_name, fund_type_override, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [cnpj.id, cnpj.competitor_id, cnpj.cnpj, cnpj.fund_name || null, cnpj.fund_type_override || null, cnpj.status || "active", cnpj.created_at]
        );
      }
      console.log(`  ✓ ${comp.name} — ${cnpjs.length} CNPJ(s) inserted`);
    }

    // Insert authorized_emails
    if (authorizedEmails.length > 0) {
      await client.query("DELETE FROM authorized_emails");
      for (const ae of authorizedEmails) {
        await client.query(
          `INSERT INTO authorized_emails (id, email, status, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [ae.id, ae.email, ae.status || "active", ae.created_at]
        );
      }
      console.log(`  ✓ ${authorizedEmails.length} authorized email(s) inserted`);
    }

    await client.query("COMMIT");

    console.log("\n✅ Migration complete!");
    console.log("\nNext steps:");
    console.log("  1. Restart the server: npm run dev");
    console.log("  2. Open the frontend and select a period — data should now load");
    console.log("  3. If you need an admin user, register via the app then run:");
    console.log("       psql fidc_intel -c \"INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = 'your@email.com';\"");

  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err.message || err);
  process.exit(1);
});
