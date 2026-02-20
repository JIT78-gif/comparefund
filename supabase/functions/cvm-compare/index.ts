import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

const CNPJS: Record<string, string[]> = {
  multiplica: ["23216398000101", "40211675000102"],
  red: ["17250006000110", "11489344000122"],
  atena: ["31904898000156"],
  cifra: ["08818152000108"],
};

// CNPJs known to be NP but whose CVM fund name is truncated and misses "Não Padronizado"
const NP_OVERRIDE: Set<string> = new Set(["40211675000102", "11489344000122"]);

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

interface FundDetail {
  company: string;
  fund_name: string;
  cnpj: string;
  period: string;
  net_assets: number;
  portfolio: number;
  liabilities: number;
  overdue: number;
  fund_type: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { refMonth, fundType } = await req.json();

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
    const response = await fetch(zipUrl);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Data not available for ${refMonth}. CVM returned ${response.status}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const zip = await JSZip.loadAsync(await response.arrayBuffer());

    const fundNames: Record<string, string> = {};
    const fundPeriods: Record<string, string> = {};
    const fundTypes: Record<string, string> = {};
    const fundLiabilities: Record<string, number> = {};
    const fundNetAssets: Record<string, number> = {};
    const fundPortfolio: Record<string, number> = {};
    const fundOverdue: Record<string, number> = {};
    const fundUnitValues: Record<string, number> = {};
    const fundCounts: Record<string, number> = { multiplica: 0, red: 0, atena: 0, cifra: 0 };

    // Include tab_III for liabilities
    const targetTables = ["tab_I", "tab_II", "tab_III", "tab_IV", "tab_VII"];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;

      const isTarget = targetTables.some((t) => filename.includes(`_${t}_`) || filename.endsWith(`_${t}.csv`));
      if (!isTarget) continue;

      console.log(`Parsing: ${filename}`);
      const { header, rows } = await parseCsvFile(file);
      if (!header.length) continue;

      const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      if (cnpjIdx === -1) continue;

      // Determine which table this is
      const isTabI = (filename.includes("tab_I_") || filename.endsWith("tab_I.csv")) &&
                     !filename.includes("tab_II") && !filename.includes("tab_IV") && !filename.includes("tab_VII") && !filename.includes("tab_III");
      const isTabII = filename.includes("tab_II") && !filename.includes("tab_III");
      const isTabIII = filename.includes("tab_III");
      const isTabIV = filename.includes("tab_IV");
      const isTabVII = filename.includes("tab_VII");

      if (isTabI) {
        // Tab I: fund identification - name, type, period
        console.log(`tab_I headers: ${header.join(", ")}`);
        const nameIdx = header.indexOf("DENOM_SOCIAL");
        const dtCompetIdx = header.indexOf("DT_COMPTC");
        const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
        const condominioIdx = header.indexOf("CONDOM");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          const company = getCompany(cnpj);
          if (!company) continue;
          if (nameIdx !== -1) fundNames[cnpj] = row[nameIdx] || "";
          if (dtCompetIdx !== -1) fundPeriods[cnpj] = row[dtCompetIdx] || "";

          // Fund type detection: check TP_FUNDO, CONDOM, and fund name
          let detectedType = NP_OVERRIDE.has(cnpj) ? "NP" : "STANDARD";
          if (tpFundoIdx !== -1) {
            const tp = (row[tpFundoIdx] || "").toUpperCase();
            if (tp.includes("NP") || tp.includes("NAO PADRONIZADO") || tp.includes("NÃO PADRONIZADO")) {
              detectedType = "NP";
            }
          }
          if (condominioIdx !== -1) {
            const cond = (row[condominioIdx] || "").toUpperCase();
            if (cond.includes("NP") || cond.includes("NAO PADRONIZADO") || cond.includes("NÃO PADRONIZADO")) {
              detectedType = "NP";
            }
          }
          // Fallback: check fund name for NP indicators
          const name = (fundNames[cnpj] || "").toUpperCase();
          if (name.includes("NAO PADRONIZADO") || name.includes("NÃO PADRONIZADO") || name.includes(" NP ") || name.endsWith(" NP")) {
            detectedType = "NP";
          }
          fundTypes[cnpj] = detectedType;
          const rawTp = tpFundoIdx !== -1 ? (row[tpFundoIdx] || "") : "N/A";
          const rawCondom = condominioIdx !== -1 ? (row[condominioIdx] || "") : "N/A";
          console.log(`Fund ${cnpj} type=${detectedType}, tp_fundo_classe=${rawTp}, condom=${rawCondom}, name=${fundNames[cnpj]?.substring(0, 50)}`);
        }
      } else if (isTabIII) {
        // Tab III: liabilities (passivos)
        console.log(`tab_III headers: ${header.join(", ")}`);
        // Try common liability column names
        const passivoIdx = header.findIndex(h =>
          h.includes("VL_PASSIVO") || h.includes("VL_PATRIM_LIQ") || h.includes("PASSIVO")
        );
        if (passivoIdx !== -1) {
          console.log(`tab_III using liability column: ${header[passivoIdx]}`);
          for (const row of rows) {
            const cnpj = cleanCnpj(row[cnpjIdx] || "");
            const company = getCompany(cnpj);
            if (!company) continue;
            const liability = parseNum(row[passivoIdx]);
            fundLiabilities[cnpj] = (fundLiabilities[cnpj] || 0) + liability;
          }
        } else {
          console.log("tab_III: no liability column found");
        }
      } else if (isTabIV) {
        console.log(`tab_IV headers: ${header.join(", ")}`);
        const plIdx = header.indexOf("TAB_IV_A_VL_PL");
        const plMedioIdx = header.indexOf("TAB_IV_B_VL_PL_MEDIO");
        const nameIdx = header.indexOf("DENOM_SOCIAL");
        const dtIdx = header.indexOf("DT_COMPTC");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          const company = getCompany(cnpj);
          if (!company) continue;
          const pl = parseNum(row[plIdx]);
          const plMedio = plMedioIdx !== -1 ? parseNum(row[plMedioIdx]) : 0;
          fundNetAssets[cnpj] = Math.max(fundNetAssets[cnpj] || 0, pl);
          if (nameIdx !== -1 && !fundNames[cnpj]) fundNames[cnpj] = row[nameIdx] || "";
          if (dtIdx !== -1 && !fundPeriods[cnpj]) fundPeriods[cnpj] = row[dtIdx] || "";
          // Compute unit variation as (PL - PL_MEDIO) / PL_MEDIO * 100
          if (plMedio > 0 && pl > 0) {
            fundUnitValues[cnpj] = ((pl - plMedio) / plMedio) * 100;
          }
          fundCounts[company]++;
        }
      } else if (isTabII) {
        const cartIdx = header.indexOf("TAB_II_VL_CARTEIRA");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          const company = getCompany(cnpj);
          if (!company) continue;
          const cart = parseNum(row[cartIdx]);
          fundPortfolio[cnpj] = Math.max(fundPortfolio[cnpj] || 0, cart);
        }
      } else if (isTabVII) {
        const overdueAdIdx = header.indexOf("TAB_VII_A3_2_VL_DIRCRED_VENC_AD");
        const overdueInadIdx = header.indexOf("TAB_VII_A4_2_VL_DIRCRED_VENC_INAD");
        const inadIdx = header.indexOf("TAB_VII_A5_2_VL_DIRCRED_INAD");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          const company = getCompany(cnpj);
          if (!company) continue;
          const ov = parseNum(row[overdueAdIdx]) + parseNum(row[overdueInadIdx]) + parseNum(row[inadIdx]);
          fundOverdue[cnpj] = (fundOverdue[cnpj] || 0) + ov;
        }
      }
    }

    // Build details array from collected per-fund data
    let details: FundDetail[] = [];
    for (const [company, cnpjs] of Object.entries(CNPJS)) {
      for (const cnpj of cnpjs) {
        if (fundNetAssets[cnpj] || fundPortfolio[cnpj]) {
          const ft = fundTypes[cnpj] || "STANDARD";
          details.push({
            company,
            fund_name: fundNames[cnpj] || `Fund ${cnpj}`,
            cnpj,
            period: fundPeriods[cnpj] || refMonth,
            net_assets: fundNetAssets[cnpj] || 0,
            portfolio: fundPortfolio[cnpj] || 0,
            liabilities: fundLiabilities[cnpj] || 0,
            overdue: fundOverdue[cnpj] || 0,
            fund_type: ft,
          });
        }
      }
    }

    // Apply fundType filter if provided
    if (fundType && (fundType === "STANDARD" || fundType === "NP")) {
      details = details.filter((d) => d.fund_type === fundType);
    }

    // Build aggregated results from filtered details
    const results: Record<string, {
      net_assets: number; portfolio: number; overdue: number;
      delinquency: number; unit_value: number; fund_count: number;
      liabilities: number; fund_type: string;
    }> = {};
    for (const company of Object.keys(CNPJS)) {
      results[company] = { net_assets: 0, portfolio: 0, overdue: 0, delinquency: 0, unit_value: 0, fund_count: 0, liabilities: 0, fund_type: fundType || "STANDARD" };
    }

    for (const d of details) {
      const r = results[d.company];
      r.net_assets += d.net_assets;
      r.portfolio += d.portfolio;
      r.overdue += d.overdue;
      r.liabilities += d.liabilities;
      r.fund_count++;
      r.fund_type = d.fund_type;
      // Use the latest unit value for each company
      if (fundUnitValues[d.cnpj]) {
        r.unit_value = fundUnitValues[d.cnpj];
      }
    }

    // Compute delinquency
    for (const key of Object.keys(results)) {
      const r = results[key];
      if (r.portfolio === 0 && r.net_assets > 0) r.portfolio = r.net_assets * 0.85;
      r.delinquency = r.portfolio > 0 ? (r.overdue / r.portfolio) * 100 : 0;
    }

    console.log("Results:", JSON.stringify(results));

    return new Response(JSON.stringify({ ...results, details }), {
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
