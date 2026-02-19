import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

const CNPJS: Record<string, string> = {
  multiplica: "23216398000101",
  red: "17250006000110",
};

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/"/g, "").replace(",", ".")) || 0;
}

function getCompany(cnpj: string): string | null {
  const clean = cleanCnpj(cnpj);
  if (clean === CNPJS.multiplica) return "multiplica";
  if (clean === CNPJS.red) return "red";
  return null;
}

interface ParsedTable {
  header: string[];
  rows: string[][];
}

async function parseCsvFile(file: JSZip.JSZipObject): Promise<ParsedTable> {
  const text = await file.async("text");
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { header: [], rows: [] };
  const header = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
  const rows = lines.slice(1).map((l) => l.split(";").map((c) => c.trim().replace(/"/g, "")));
  return { header, rows };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { refMonth } = await req.json();

    if (!refMonth || refMonth.length !== 6) {
      return new Response(
        JSON.stringify({ error: "refMonth must be YYYYMM format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const yearNum = parseInt(refMonth.substring(0, 4));

    const zipUrl = yearNum < 2019
      ? `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/HIST/inf_mensal_fidc_${yearNum}.zip`
      : `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_${refMonth}.zip`;

    console.log(`Fetching: ${zipUrl}`);
    const response = await fetch(zipUrl, { signal: AbortSignal.timeout(25000) });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Data not available for ${refMonth}. CVM returned ${response.status}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const zip = await JSZip.loadAsync(await response.arrayBuffer());

    const results: Record<string, { net_assets: number; portfolio: number; overdue: number; delinquency: number; unit_value: number }> = {
      multiplica: { net_assets: 0, portfolio: 0, overdue: 0, delinquency: 0, unit_value: 0 },
      red: { net_assets: 0, portfolio: 0, overdue: 0, delinquency: 0, unit_value: 0 },
    };

    // Only parse the 3 tables we need
    const targetTables = ["tab_IV", "tab_II", "tab_VII"];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;

      // Check if this is one of our target tables (exact match, not substring like tab_IV inside tab_IX)
      const isTarget = targetTables.some((t) => {
        const regex = new RegExp(`_${t.replace("tab_", "tab_")}[_.]`);
        // Match patterns like: _tab_IV_YYYYMM.csv or _tab_II_YYYYMM.csv
        return filename.includes(`_${t}_`) || filename.endsWith(`_${t}.csv`);
      });

      if (!isTarget) continue;

      console.log(`Parsing: ${filename}`);
      const { header, rows } = await parseCsvFile(file);
      if (!header.length) continue;

      const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      if (cnpjIdx === -1) continue;

      if (filename.includes("tab_IV")) {
        const plIdx = header.indexOf("TAB_IV_A_VL_PL");
        for (const row of rows) {
          const company = getCompany(row[cnpjIdx] || "");
          if (!company) continue;
          const pl = parseNum(row[plIdx]);
          if (pl > results[company].net_assets) results[company].net_assets = pl;
        }
      } else if (filename.includes("tab_II") && !filename.includes("tab_III")) {
        const cartIdx = header.indexOf("TAB_II_VL_CARTEIRA");
        for (const row of rows) {
          const company = getCompany(row[cnpjIdx] || "");
          if (!company) continue;
          const cart = parseNum(row[cartIdx]);
          if (cart > results[company].portfolio) results[company].portfolio = cart;
        }
      } else if (filename.includes("tab_VII")) {
        const overdueAdIdx = header.indexOf("TAB_VII_A3_2_VL_DIRCRED_VENC_AD");
        const overdueInadIdx = header.indexOf("TAB_VII_A4_2_VL_DIRCRED_VENC_INAD");
        const inadIdx = header.indexOf("TAB_VII_A5_2_VL_DIRCRED_INAD");
        for (const row of rows) {
          const company = getCompany(row[cnpjIdx] || "");
          if (!company) continue;
          results[company].overdue += parseNum(row[overdueAdIdx]) + parseNum(row[overdueInadIdx]) + parseNum(row[inadIdx]);
        }
      }
    }

    // Compute delinquency
    for (const key of Object.keys(results)) {
      const r = results[key];
      if (r.portfolio === 0 && r.net_assets > 0) r.portfolio = r.net_assets * 0.85;
      r.delinquency = r.portfolio > 0 ? (r.overdue / r.portfolio) * 100 : 0;
    }

    console.log("Results:", JSON.stringify(results));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
