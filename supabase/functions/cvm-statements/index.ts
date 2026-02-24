import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

const CNPJS: Record<string, string[]> = {
  multiplica: ["23216398000101", "40211675000102"],
  red: ["17250006000110", "11489344000122"],
  atena: ["31904898000156"],
  cifra: ["08818152000108"],
};

const NP_OVERRIDE: Set<string> = new Set(["40211675000102"]);

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/"/g, "").replace(",", ".")) || 0;
}

function getCompany(cnpj: string): string | null {
  const clean = cleanCnpj(cnpj);
  for (const [company, cnpjs] of Object.entries(CNPJS)) {
    if (cnpjs.includes(clean)) return company;
  }
  return null;
}

function getFundType(cnpj: string, name: string, tpFundo: string, condom: string): string {
  if (NP_OVERRIDE.has(cnpj)) return "NP";
  const upper = (s: string) => (s || "").toUpperCase();
  if (upper(tpFundo).includes("NP") || upper(tpFundo).includes("NAO PADRONIZADO") || upper(tpFundo).includes("NÃO PADRONIZADO")) return "NP";
  if (upper(condom).includes("NP") || upper(condom).includes("NAO PADRONIZADO") || upper(condom).includes("NÃO PADRONIZADO")) return "NP";
  if (upper(name).includes("NAO PADRONIZADO") || upper(name).includes("NÃO PADRONIZADO") || upper(name).includes(" NP ") || upper(name).endsWith(" NP")) return "NP";
  return "STANDARD";
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

async function fetchMonthData(refMonth: string, fundType?: string) {
  const yearNum = parseInt(refMonth.substring(0, 4));
  const zipUrl = yearNum < 2019
    ? `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/HIST/inf_mensal_fidc_${yearNum}.zip`
    : `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_${refMonth}.zip`;

  console.log(`[cvm-statements] Fetching: ${zipUrl}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // 55s — safely under runtime limit
  let response: Response;
  try {
    response = await fetch(zipUrl, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`TIMEOUT:${refMonth}:CVM server took too long to respond. Try an earlier month.`);
    }
    throw new Error(`NETWORK:${refMonth}:${e instanceof Error ? e.message : String(e)}`);
  }
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`UNAVAILABLE:${refMonth}:Data not available (HTTP ${response.status}). Try an earlier month.`);
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());

  const fundData: Record<string, Record<string, number>> = {};
  const fundNames: Record<string, string> = {};
  const fundTypes: Record<string, string> = {};

  const targetTables = ["tab_I", "tab_III", "tab_IV"];

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir || !filename.endsWith(".csv")) continue;

    const isTarget = targetTables.some((t) => filename.includes(`_${t}_`) || filename.endsWith(`_${t}.csv`));
    if (!isTarget) continue;

    const isTabI = (filename.includes("tab_I_") || filename.endsWith("tab_I.csv")) &&
                   !filename.includes("tab_II") && !filename.includes("tab_IV") && !filename.includes("tab_III");
    const isTabIII = filename.includes("tab_III");
    const isTabIV = filename.includes("tab_IV");
    if (!isTabI && !isTabIII && !isTabIV) continue;

    console.log(`[cvm-statements] Parsing: ${filename}`);
    const { header, rows } = await parseCsvFile(file);
    if (!header.length) continue;

    const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
    if (cnpjIdx === -1) continue;

    const tabColumns: { name: string; idx: number }[] = [];
    for (let i = 0; i < header.length; i++) {
      if (header[i].startsWith("TAB_")) {
        tabColumns.push({ name: header[i], idx: i });
      }
    }

    const nameIdx = header.indexOf("DENOM_SOCIAL");
    const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
    const condominioIdx = header.indexOf("CONDOM");

    for (const row of rows) {
      const cnpj = cleanCnpj(row[cnpjIdx] || "");
      const company = getCompany(cnpj);
      if (!company) continue;

      if (nameIdx !== -1 && !fundNames[cnpj]) {
        fundNames[cnpj] = row[nameIdx] || "";
      }

      if (isTabI && !fundTypes[cnpj]) {
        fundTypes[cnpj] = getFundType(
          cnpj,
          fundNames[cnpj] || "",
          tpFundoIdx !== -1 ? row[tpFundoIdx] || "" : "",
          condominioIdx !== -1 ? row[condominioIdx] || "" : ""
        );
      }

      if (!fundData[cnpj]) fundData[cnpj] = {};

      for (const col of tabColumns) {
        const val = parseNum(row[col.idx]);
        if (val !== 0) {
          fundData[cnpj][col.name] = (fundData[cnpj][col.name] || 0) + val;
        }
      }
    }
  }

  const result: Record<string, Record<string, Record<string, number | string>>> = {};
  for (const [cnpj, data] of Object.entries(fundData)) {
    const company = getCompany(cnpj)!;
    const type = fundTypes[cnpj] || "STANDARD";
    if (fundType && fundType !== type) continue;

    if (!result[company]) result[company] = {};
    result[company][cnpj] = {
      fund_name: fundNames[cnpj] || `Fund ${cnpj}`,
      fund_type: type,
      ...data,
    };
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { months, fundType } = await req.json();

    if (!months || !Array.isArray(months) || months.length === 0) {
      return new Response(
        JSON.stringify({ error: "months must be an array of YYYYMM strings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, Record<string, Record<string, Record<string, number | string>>>> = {};
    const errors: Record<string, string> = {};

    // Fetch each month independently — one failure won't block others
    for (const month of months) {
      if (typeof month !== "string" || month.length !== 6) {
        errors[month] = `Invalid month format: ${month}. Must be YYYYMM`;
        continue;
      }
      try {
        results[month] = await fetchMonthData(month, fundType);
      } catch (err) {
        console.error(`[cvm-statements] Error for ${month}:`, err);
        errors[month] = err instanceof Error ? err.message : String(err);
      }
    }

    // If we got at least some data, return partial success
    if (Object.keys(results).length > 0) {
      return new Response(
        JSON.stringify({ ...results, ...(Object.keys(errors).length > 0 ? { _errors: errors } : {}) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All months failed
    return new Response(
      JSON.stringify({ error: "All requested months failed", details: errors }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[cvm-statements] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
