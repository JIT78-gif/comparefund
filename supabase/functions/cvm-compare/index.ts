import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

// Seed CNPJs used to identify which administrator manages each company
const SEED_CNPJS: Record<string, string[]> = {
  multiplica: ["23216398000101"],
  red: ["17250006000110"],
};

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/"/g, "").replace(",", ".")) || 0;
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

function normalizeText(s: string): string {
  // Normalize accented chars and encoding artifacts for comparison
  return s.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 \-]/g, " ");
}

function detectFundType(tpFundo: string, condom: string, fundName: string): string {
  const tp = normalizeText(tpFundo);
  const cond = normalizeText(condom);
  const name = normalizeText(fundName);
  if (tp.includes("NP") || tp.includes("NAO PADRONIZADO")) return "NP";
  if (cond.includes("NP") || cond.includes("NAO PADRONIZADO")) return "NP";
  if (name.includes("NAO PADRONIZADO") || name.includes("NAO-PADRONIZADO") || name.includes(" NP ") || name.endsWith(" NP") || name.includes("-NP") || name.includes(" NP-") || name.includes("FIDC-NP") || name.includes("FIDC NP")) return "NP";
  return "STANDARD";
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

    // ── PASS 1: Parse tab_I to discover admin CNPJs and ALL fund CNPJs per company ──
    // Map: admin CNPJ → company name (discovered from seed CNPJs)
    const adminToCompany: Record<string, string> = {};
    // Map: fund CNPJ → company name (expanded beyond seeds)
    const fundToCompany: Record<string, string> = {};
    // Fund metadata from tab_I
    const fundNames: Record<string, string> = {};
    const fundPeriods: Record<string, string> = {};
    const fundTypes: Record<string, string> = {};

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;
      const isTabI = (filename.includes("tab_I_") || filename.endsWith("tab_I.csv")) &&
                     !filename.includes("tab_II") && !filename.includes("tab_IV") && !filename.includes("tab_VII") && !filename.includes("tab_III");
      if (!isTabI) continue;

      console.log(`Pass 1 - Parsing: ${filename}`);
      const { header, rows } = await parseCsvFile(file);
      if (!header.length) continue;

      const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      const adminCnpjIdx = header.indexOf("CNPJ_ADMIN");
      const nameIdx = header.indexOf("DENOM_SOCIAL");
      const dtCompetIdx = header.indexOf("DT_COMPTC");
      const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
      const condominioIdx = header.indexOf("CONDOM");

      if (cnpjIdx === -1) continue;

      // First: find admin CNPJs for our seed funds
      for (const row of rows) {
        const fundCnpj = cleanCnpj(row[cnpjIdx] || "");
        const adminCnpj = adminCnpjIdx !== -1 ? cleanCnpj(row[adminCnpjIdx] || "") : "";
        
        // Check if this fund is one of our seeds
        for (const [company, seeds] of Object.entries(SEED_CNPJS)) {
          if (seeds.includes(fundCnpj) && adminCnpj) {
            adminToCompany[adminCnpj] = company;
          }
        }
      }

      console.log(`Discovered admin CNPJs: ${JSON.stringify(adminToCompany)}`);

      // Second pass on same data: find ALL funds belonging to discovered admins
      for (const row of rows) {
        const fundCnpj = cleanCnpj(row[cnpjIdx] || "");
        const adminCnpj = adminCnpjIdx !== -1 ? cleanCnpj(row[adminCnpjIdx] || "") : "";
        
        // Match by admin CNPJ or by seed CNPJ directly
        let company: string | null = null;
        if (adminCnpj && adminToCompany[adminCnpj]) {
          company = adminToCompany[adminCnpj];
        } else {
          for (const [comp, seeds] of Object.entries(SEED_CNPJS)) {
            if (seeds.includes(fundCnpj)) { company = comp; break; }
          }
        }
        if (!company) continue;

        fundToCompany[fundCnpj] = company;
        if (nameIdx !== -1) fundNames[fundCnpj] = row[nameIdx] || "";
        if (dtCompetIdx !== -1) fundPeriods[fundCnpj] = row[dtCompetIdx] || "";

        const tpFundo = tpFundoIdx !== -1 ? (row[tpFundoIdx] || "") : "";
        const condom = condominioIdx !== -1 ? (row[condominioIdx] || "") : "";
        fundTypes[fundCnpj] = detectFundType(tpFundo, condom, fundNames[fundCnpj] || "");
      }

      const npCount = Object.values(fundTypes).filter(t => t === "NP").length;
      const stdCount = Object.values(fundTypes).filter(t => t === "STANDARD").length;
      console.log(`Total funds: ${Object.keys(fundToCompany).length} (${stdCount} STANDARD, ${npCount} NP)`);
    }

    // Helper to get company for a fund CNPJ (using expanded mapping)
    const getCompany = (cnpj: string): string | null => fundToCompany[cleanCnpj(cnpj)] || null;

    // ── PASS 2: Parse remaining tables using discovered fund CNPJs ──
    const fundLiabilities: Record<string, number> = {};
    const fundNetAssets: Record<string, number> = {};
    const fundPortfolio: Record<string, number> = {};
    const fundOverdue: Record<string, number> = {};
    const fundUnitValues: Record<string, number> = {};

    const dataTables = ["tab_II", "tab_III", "tab_IV", "tab_VII"];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;
      const isTarget = dataTables.some((t) => filename.includes(`_${t}_`) || filename.endsWith(`_${t}.csv`));
      if (!isTarget) continue;

      console.log(`Pass 2 - Parsing: ${filename}`);
      const { header, rows } = await parseCsvFile(file);
      if (!header.length) continue;

      const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      if (cnpjIdx === -1) continue;

      const isTabII = filename.includes("tab_II") && !filename.includes("tab_III");
      const isTabIII = filename.includes("tab_III");
      const isTabIV = filename.includes("tab_IV");
      const isTabVII = filename.includes("tab_VII");

      if (isTabIII) {
        const passivoIdx = header.findIndex(h => h.includes("VL_PASSIVO") || h.includes("PASSIVO"));
        if (passivoIdx !== -1) {
          for (const row of rows) {
            const cnpj = cleanCnpj(row[cnpjIdx] || "");
            if (!getCompany(cnpj)) continue;
            fundLiabilities[cnpj] = (fundLiabilities[cnpj] || 0) + parseNum(row[passivoIdx]);
          }
        }
      } else if (isTabIV) {
        const plIdx = header.indexOf("TAB_IV_A_VL_PL");
        const plMedioIdx = header.indexOf("TAB_IV_B_VL_PL_MEDIO");
        const nameIdx = header.indexOf("DENOM_SOCIAL");
        const dtIdx = header.indexOf("DT_COMPTC");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!getCompany(cnpj)) continue;
          const pl = parseNum(row[plIdx]);
          const plMedio = plMedioIdx !== -1 ? parseNum(row[plMedioIdx]) : 0;
          fundNetAssets[cnpj] = Math.max(fundNetAssets[cnpj] || 0, pl);
          if (nameIdx !== -1 && !fundNames[cnpj]) fundNames[cnpj] = row[nameIdx] || "";
          if (dtIdx !== -1 && !fundPeriods[cnpj]) fundPeriods[cnpj] = row[dtIdx] || "";
          if (plMedio > 0 && pl > 0) {
            fundUnitValues[cnpj] = ((pl - plMedio) / plMedio) * 100;
          }
        }
      } else if (isTabII) {
        const cartIdx = header.indexOf("TAB_II_VL_CARTEIRA");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!getCompany(cnpj)) continue;
          fundPortfolio[cnpj] = Math.max(fundPortfolio[cnpj] || 0, parseNum(row[cartIdx]));
        }
      } else if (isTabVII) {
        const overdueAdIdx = header.indexOf("TAB_VII_A3_2_VL_DIRCRED_VENC_AD");
        const overdueInadIdx = header.indexOf("TAB_VII_A4_2_VL_DIRCRED_VENC_INAD");
        const inadIdx = header.indexOf("TAB_VII_A5_2_VL_DIRCRED_INAD");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!getCompany(cnpj)) continue;
          fundOverdue[cnpj] = (fundOverdue[cnpj] || 0) + parseNum(row[overdueAdIdx]) + parseNum(row[overdueInadIdx]) + parseNum(row[inadIdx]);
        }
      }
    }

    // ── Build details array ──
    let details: FundDetail[] = [];
    for (const [cnpj, company] of Object.entries(fundToCompany)) {
      if (fundNetAssets[cnpj] || fundPortfolio[cnpj]) {
        details.push({
          company,
          fund_name: fundNames[cnpj] || `Fund ${cnpj}`,
          cnpj,
          period: fundPeriods[cnpj] || refMonth,
          net_assets: fundNetAssets[cnpj] || 0,
          portfolio: fundPortfolio[cnpj] || 0,
          liabilities: fundLiabilities[cnpj] || 0,
          overdue: fundOverdue[cnpj] || 0,
          fund_type: fundTypes[cnpj] || "STANDARD",
        });
      }
    }

    // Apply fundType filter
    if (fundType === "STANDARD" || fundType === "NP") {
      details = details.filter((d) => d.fund_type === fundType);
    }

    console.log(`After filter (${fundType}): ${details.length} funds`);

    // ── Aggregate results ──
    const results: Record<string, {
      net_assets: number; portfolio: number; overdue: number;
      delinquency: number; unit_value: number; fund_count: number;
      liabilities: number; fund_type: string;
    }> = {
      multiplica: { net_assets: 0, portfolio: 0, overdue: 0, delinquency: 0, unit_value: 0, fund_count: 0, liabilities: 0, fund_type: fundType || "STANDARD" },
      red: { net_assets: 0, portfolio: 0, overdue: 0, delinquency: 0, unit_value: 0, fund_count: 0, liabilities: 0, fund_type: fundType || "STANDARD" },
    };

    for (const d of details) {
      const r = results[d.company];
      if (!r) continue;
      r.net_assets += d.net_assets;
      r.portfolio += d.portfolio;
      r.overdue += d.overdue;
      r.liabilities += d.liabilities;
      r.fund_count++;
      r.fund_type = d.fund_type;
      if (fundUnitValues[d.cnpj]) r.unit_value = fundUnitValues[d.cnpj];
    }

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
