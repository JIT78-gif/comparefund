/**
 * Seed competitors + CNPJs into local PostgreSQL (no psql required).
 * Run from server/ directory: npm run seed-competitors
 */
import pg from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";

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
  } catch { return {}; }
}

const serverEnv = parseEnvFile(resolve(import.meta.dirname, "../.env"));
const DATABASE_URL = serverEnv.DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fidc_intel";

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("Connected to:", DATABASE_URL.replace(/:\/\/[^@]+@/, "://<credentials>@"));
    await client.query("BEGIN");

    // Clear stale data
    await client.query("DELETE FROM statement_cache");
    await client.query("DELETE FROM competitor_cnpjs");
    await client.query("DELETE FROM competitors");
    console.log("Cleared old data\n");

    // ── Competitors ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO competitors (id, name, slug, status, created_at, updated_at) VALUES
        ('cbbdcb9c-2b5f-4182-8bdc-88e81bf02c85', 'Atena',      'atena',      'active', '2026-03-05 12:11:10.505717+00', '2026-03-05 12:11:10.505717+00'),
        ('4eafa984-fb02-41df-805b-756e3c25af9b', 'Multiplica', 'multiplica', 'active', '2026-03-05 12:11:10.505717+00', '2026-03-06 08:59:07.530690+00'),
        ('bf42959c-50ca-4597-9c0d-00fa972d8884', 'Red',        'red',        'active', '2026-03-05 12:11:10.505717+00', '2026-03-06 04:18:59.511935+00'),
        ('6e5bd0cd-6973-4232-918b-77bc2d7a65b3', 'Sifra',      'sifra',      'active', '2026-03-05 12:11:10.505717+00', '2026-03-05 12:11:10.505717+00')
    `);
    console.log("Inserted 4 competitors");

    // ── CNPJs ──────────────────────────────────────────────────────────────
    // Atena
    await client.query(`
      INSERT INTO competitor_cnpjs (id, competitor_id, cnpj, fund_name, fund_type_override, status, created_at) VALUES
        ('51e4d463-0aca-489e-b57e-13c73a82bf8d', 'cbbdcb9c-2b5f-4182-8bdc-88e81bf02c85',
         '56886293000100', 'ATHENAS FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS', NULL, 'inactive', '2026-03-05 16:05:27.971111+00')
    `);

    // Multiplica
    await client.query(`
      INSERT INTO competitor_cnpjs (id, competitor_id, cnpj, fund_name, fund_type_override, status, created_at) VALUES
        ('7ffcb98d-7493-459b-bb06-9b95042d1984', '4eafa984-fb02-41df-805b-756e3c25af9b', '23216398000101', NULL, NULL, 'active', '2026-03-05 12:11:21.383754+00'),
        ('bc128c37-0aeb-4624-9860-11eaa692fc79', '4eafa984-fb02-41df-805b-756e3c25af9b', '28912060000108', 'SETE ROCAS FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS NÃO-PADRONIZADOS', NULL, 'active', '2026-03-20 13:14:49.777806+00'),
        ('cfc5d963-b1ab-456d-8a79-4f8fe78117ed', '4eafa984-fb02-41df-805b-756e3c25af9b', '29226508000194', 'HOD FUNDO DE INVESTIMENTO EM QUOTAS DE FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS', NULL, 'active', '2026-03-20 13:14:44.033059+00'),
        ('a8ab94ce-0997-424a-b750-4a54390ae444', '4eafa984-fb02-41df-805b-756e3c25af9b', '29492653000117', 'AMGW FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE INVESTIMENTO EM DIREITOS CREDITÓRIOS - NP', NULL, 'active', '2026-03-20 13:14:47.202274+00'),
        ('90c48781-509d-499e-82c1-c16f91dab990', '4eafa984-fb02-41df-805b-756e3c25af9b', '29602821000180', 'RAO CREDIT FUNDO DE INVESTIMENTO EM DIREITOS CREDITORIOS MULTISSETORIAL', NULL, 'active', '2026-03-20 13:14:49.265487+00'),
        ('e1fdb2ab-dc7e-4767-bf47-19032d903a0e', '4eafa984-fb02-41df-805b-756e3c25af9b', '29614353000163', 'FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS NEOCRED CONSIGNADO PRIVADO', NULL, 'active', '2026-03-20 13:14:48.869504+00'),
        ('40d75def-4188-4aae-8498-6bd47b18361c', '4eafa984-fb02-41df-805b-756e3c25af9b', '32388135000162', 'MULTIAGRO FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS', NULL, 'active', '2026-03-06 19:40:56.399872+00'),
        ('8a077492-e678-495c-9a39-60d5b9f473aa', '4eafa984-fb02-41df-805b-756e3c25af9b', '32510577000130', 'MULTIPLICA LONG TERM LONGO PRAZO FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS', NULL, 'active', '2026-03-06 04:00:22.473452+00'),
        ('769a7273-bc4c-4ce5-aef7-fdfa0c46a4f6', '4eafa984-fb02-41df-805b-756e3c25af9b', '32948489000114', 'OURO 04 FUNDO DE INVESTIMENTO MULTIMERCADO CRÉDITO PRIVADO INVESTIMENTO NO EXTERIOR', NULL, 'active', '2026-03-20 13:14:44.276798+00'),
        ('62d17c9f-6e6b-4316-9816-3fdc84eb8bdd', '4eafa984-fb02-41df-805b-756e3c25af9b', '37258911000123', 'TERRA 35 FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS NÃO PADRONIZADOS', NULL, 'active', '2026-03-20 13:14:42.757713+00'),
        ('8f46bdeb-6b37-49a4-816c-5bd72f27c79b', '4eafa984-fb02-41df-805b-756e3c25af9b', '37258955000153', 'TERRA 36 FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS NÃO PADRONIZADOS', NULL, 'active', '2026-03-20 13:14:43.603655+00'),
        ('ce90d98b-fd9e-4f3c-9755-06648335c401', '4eafa984-fb02-41df-805b-756e3c25af9b', '40211675000102', NULL, 'NP', 'active', '2026-03-05 12:11:21.383754+00'),
        ('361560aa-2110-48c8-a507-989b286dd6d6', '4eafa984-fb02-41df-805b-756e3c25af9b', '41778552000102', 'LABOR CASH FUNDO DE INVESTIMENTO EM PARTICIPACOES MULTIESTRATEGIA', NULL, 'active', '2026-03-20 13:14:40.664836+00'),
        ('814075a2-8cc8-4aac-8d49-04d0003bd141', '4eafa984-fb02-41df-805b-756e3c25af9b', '41820693000146', 'FLORIANO FUNDO DE INVESTIMENTO IMOBILIÁRIO', NULL, 'active', '2026-03-20 13:14:38.949121+00'),
        ('62bf9ea9-3b8e-4047-8a31-b6bc9d47a16e', '4eafa984-fb02-41df-805b-756e3c25af9b', '42584097000177', 'ILHA AZUL FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS NÃO PADRONIZADOS', NULL, 'active', '2026-03-20 13:14:39.890416+00')
    `);
    console.log("  ✓ Multiplica — 15 CNPJs");

    // Red
    await client.query(`
      INSERT INTO competitor_cnpjs (id, competitor_id, cnpj, fund_name, fund_type_override, status, created_at) VALUES
        ('0006c458-0fa9-42e9-b519-708e13cbcaf7', 'bf42959c-50ca-4597-9c0d-00fa972d8884', '11489344000122', 'RED PERFORMANCE FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS NP DE RESPONSABILIDADE LIMITADA', NULL, 'active', '2026-03-06 08:17:35.729229+00'),
        ('3fcec474-7c70-4b30-afd5-efa8509b4a58', 'bf42959c-50ca-4597-9c0d-00fa972d8884', '17250006000110', 'RED FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS REAL LP DE RESPONSABILIDADE LIMITADA', NULL, 'active', '2026-03-05 16:43:07.627802+00')
    `);
    console.log("  ✓ Red — 2 CNPJs");

    // Sifra
    await client.query(`
      INSERT INTO competitor_cnpjs (id, competitor_id, cnpj, fund_name, fund_type_override, status, created_at) VALUES
        ('77b58d8c-46e3-4bfc-806e-6debd262b217', '6e5bd0cd-6973-4232-918b-77bc2d7a65b3', '08678936000188', NULL, NULL, 'active', '2026-03-05 12:11:21.383754+00'),
        ('8861661b-f691-46cb-b06e-d74a63e113e4', '6e5bd0cd-6973-4232-918b-77bc2d7a65b3', '14166140000149', NULL, NULL, 'active', '2026-03-05 12:11:21.383754+00'),
        ('f562e8b1-a831-4f38-96e7-1936607a4195', '6e5bd0cd-6973-4232-918b-77bc2d7a65b3', '17012019000150', NULL, 'NP', 'active', '2026-03-05 12:11:21.383754+00'),
        ('a8f91a47-6c4b-4bb4-9909-8d15666307b4', '6e5bd0cd-6973-4232-918b-77bc2d7a65b3', '41351629000163', NULL, NULL, 'active', '2026-03-05 12:11:21.383754+00'),
        ('62a1955a-1f97-41e7-a1de-dc4e81757e41', '6e5bd0cd-6973-4232-918b-77bc2d7a65b3', '42462120000150', NULL, NULL, 'active', '2026-03-05 12:11:21.383754+00'),
        ('f2d0f9aa-dd17-46a5-991c-1415355bcb6f', '6e5bd0cd-6973-4232-918b-77bc2d7a65b3', '54889584000127', NULL, NULL, 'active', '2026-03-05 12:11:21.383754+00')
    `);
    console.log("  ✓ Sifra — 6 CNPJs");

    await client.query("COMMIT");
    console.log("\n✅ Seed complete! Restart the server with: npm run dev");

  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("❌ Seed failed:", err.message); process.exit(1); });
