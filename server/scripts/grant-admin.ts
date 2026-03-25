/**
 * Grants admin role to an email address.
 * If the user doesn't exist yet, creates them with password: Admin@123
 * Usage: npm run grant-admin
 */
import pg from "pg";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { resolve } from "path";

const TARGET_EMAIL = process.argv[2] || "jitguard76@gmail.com";
const DEFAULT_PASSWORD = process.argv[3] || "Admin@123";

if (!TARGET_EMAIL.includes("@")) {
  console.error("Usage: npm run grant-admin -- email@example.com [password]");
  process.exit(1);
}

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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      result[key] = val;
    }
    return result;
  } catch { return {}; }
}

const serverEnv = parseEnvFile(resolve(import.meta.dirname, "../.env"));
const DATABASE_URL = serverEnv.DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fidc_intel";

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Check if user exists
    const { rows } = await client.query("SELECT id FROM users WHERE email = $1", [TARGET_EMAIL]);

    let userId: string;
    if (rows.length > 0) {
      userId = rows[0].id;
      console.log(`User found: ${TARGET_EMAIL} (id: ${userId})`);
    } else {
      // Create user with default password
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      const insert = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
        [TARGET_EMAIL, hash]
      );
      userId = insert.rows[0].id;
      await client.query("INSERT INTO profiles (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, TARGET_EMAIL]);
      console.log(`Created user: ${TARGET_EMAIL} with password: ${DEFAULT_PASSWORD}`);
    }

    // Grant admin role
    await client.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT (user_id, role) DO NOTHING",
      [userId]
    );

    console.log(`✅ Admin role granted to ${TARGET_EMAIL}`);
    if (rows.length === 0) {
      console.log(`\nLogin with:`);
      console.log(`  Email   : ${TARGET_EMAIL}`);
      console.log(`  Password: ${DEFAULT_PASSWORD}`);
      console.log(`\nChange the password after first login.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("❌ Failed:", err.message); process.exit(1); });
