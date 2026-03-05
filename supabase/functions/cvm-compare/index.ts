import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

let CNPJS: Record<string, string[]> = {};
let NP_OVERRIDE: Set<string> = new Set();

async function loadCompetitors() {
  const { data, error } = await supabase
    .from("competitors")
    .select("slug, competitor_cnpjs(cnpj, fund_type_override, status)")
    .eq("status", "active");
  if (error) {
    console.error("[loadCompetitors] DB error:", error.message);
    return;
  }
  const cnpjs: Record<string, string[]> = {};
  const npSet = new Set<string>();
  for (const comp of data || []) {
    const activeCnpjs = ((comp as any).competitor_cnpjs || [])
      .filter((c: any) => c.status === "active");
    cnpjs[comp.slug] = activeCnpjs.map((c: any) => c.cnpj);
    for (const c of activeCnpjs) {
      if (c.fund_type_override === "NP") npSet.add(c.cnpj);
    }
  }
  CNPJS = cnpjs;
  NP_OVERRIDE = npSet;
}

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  let cleaned = val.replace(/"/g, "").trim();
  // Handle parentheses for negative numbers: (1234.56) -> -1234.56
  const isNeg = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isNeg) cleaned = cleaned.slice(1, -1);
  // Replace comma decimal separator
  cleaned = cleaned.replace(",", ".");
  // Remove thousands separators (dots before the decimal dot)
  const parts = cleaned.split(".");
  if (parts.length > 2) {
    const last = parts.pop()!;
    cleaned = parts.join("") + "." + last;
  }
  const num = parseFloat(cleaned) || 0;
  return isNeg ? -num : num;
}

function isValidCnpj(cnpj: string): boolean {
  return /^\d{14}$/.test(cnpj);
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
  cash: number;
  shareholders: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await loadCompetitors();
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
    const fundCash: Record<string, number> = {};
    const fundShareholders: Record<string, number> = {};

    // Parse stats
    let totalRowsParsed = 0;
    let rowsMatched = 0;
    let rowsSkippedInvalidCnpj = 0;
    let anomaliesLogged = 0;

    const targetTables = ["tab_I", "tab_II", "tab_III", "tab_IV", "tab_V", "tab_VI", "tab_VII"];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;

      const isTarget = targetTables.some((t) => filename.includes(`_${t}_`) || filename.endsWith(`_${t}.csv`));
      if (!isTarget) continue;

      console.log(`Parsing: ${filename}`);
      const { header, rows } = await parseCsvFile(file);
      if (!header.length) continue;

      const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      if (cnpjIdx === -1) continue;

      // Determine which table
      const isTabI = (filename.includes("tab_I_") || filename.endsWith("tab_I.csv")) &&
                     !filename.includes("tab_II") && !filename.includes("tab_IV") && !filename.includes("tab_VII") && !filename.includes("tab_III") && !filename.includes("tab_V") && !filename.includes("tab_VI");
      const isTabII = filename.includes("tab_II") && !filename.includes("tab_III");
      const isTabIII = filename.includes("tab_III");
      const isTabIV = filename.includes("tab_IV");
      const isTabV = filename.includes("tab_V") && !filename.includes("tab_VI") && !filename.includes("tab_VII");
      const isTabVI = filename.includes("tab_VI") && !filename.includes("tab_VII");
      const isTabVII = filename.includes("tab_VII");

      if (isTabI) {
        const nameIdx = header.indexOf("DENOM_SOCIAL");
        const dtCompetIdx = header.indexOf("DT_COMPTC");
        const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
        const condominioIdx = header.indexOf("CONDOM");
        const dispIdx = header.indexOf("TAB_I1_VL_DISP");
        for (const row of rows) {
          totalRowsParsed++;
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj)) { rowsSkippedInvalidCnpj++; continue; }
          const company = getCompany(cnpj);
          if (!company) continue;
          rowsMatched++;
          if (nameIdx !== -1) fundNames[cnpj] = row[nameIdx] || "";
          if (dtCompetIdx !== -1) fundPeriods[cnpj] = row[dtCompetIdx] || "";

          if (dispIdx !== -1) {
            const cashVal = parseNum(row[dispIdx]);
            if (Math.abs(cashVal) > 1e12) { console.warn(`[anomaly] Cash ${cashVal} for ${cnpj}`); anomaliesLogged++; }
            fundCash[cnpj] = (fundCash[cnpj] || 0) + cashVal;
          }

          let detectedType = NP_OVERRIDE.has(cnpj) ? "NP" : "STANDARD";
          if (tpFundoIdx !== -1) {
            const tp = (row[tpFundoIdx] || "").toUpperCase();
            if (tp.includes("NP") || tp.includes("NAO PADRONIZADO") || tp.includes("NÃO PADRONIZADO")) detectedType = "NP";
          }
          if (condominioIdx !== -1) {
            const cond = (row[condominioIdx] || "").toUpperCase();
            if (cond.includes("NP") || cond.includes("NAO PADRONIZADO") || cond.includes("NÃO PADRONIZADO")) detectedType = "NP";
          }
          const name = (fundNames[cnpj] || "").toUpperCase();
          if (name.includes("NAO PADRONIZADO") || name.includes("NÃO PADRONIZADO") || name.includes(" NP ") || name.endsWith(" NP")) detectedType = "NP";
          fundTypes[cnpj] = detectedType;
        }
      } else if (isTabIII) {
        const passivoIdx = header.findIndex(h => h.includes("VL_PASSIVO") || h.includes("VL_PATRIM_LIQ") || h.includes("PASSIVO"));
        if (passivoIdx !== -1) {
          for (const row of rows) {
            totalRowsParsed++;
            const cnpj = cleanCnpj(row[cnpjIdx] || "");
            if (!isValidCnpj(cnpj)) { rowsSkippedInvalidCnpj++; continue; }
            const company = getCompany(cnpj);
            if (!company) continue;
            rowsMatched++;
            const val = parseNum(row[passivoIdx]);
            if (Math.abs(val) > 1e12) { console.warn(`[anomaly] Liability ${val} for ${cnpj}`); anomaliesLogged++; }
            fundLiabilities[cnpj] = (fundLiabilities[cnpj] || 0) + val;
          }
        }
      } else if (isTabIV) {
        const plIdx = header.indexOf("TAB_IV_A_VL_PL");
        const plMedioIdx = header.indexOf("TAB_IV_B_VL_PL_MEDIO");
        const nameIdx = header.indexOf("DENOM_SOCIAL");
        const dtIdx = header.indexOf("DT_COMPTC");
        const cotistasIdx = header.findIndex(h => h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("NR_COTISTA") || h.includes("COTST"));
        for (const row of rows) {
          totalRowsParsed++;
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj)) { rowsSkippedInvalidCnpj++; continue; }
          const company = getCompany(cnpj);
          if (!company) continue;
          rowsMatched++;
          const pl = parseNum(row[plIdx]);
          const plMedio = plMedioIdx !== -1 ? parseNum(row[plMedioIdx]) : 0;
          if (Math.abs(pl) > 1e12) { console.warn(`[anomaly] PL ${pl} for ${cnpj}`); anomaliesLogged++; }
          fundNetAssets[cnpj] = Math.max(fundNetAssets[cnpj] || 0, pl);
          if (nameIdx !== -1 && !fundNames[cnpj]) fundNames[cnpj] = row[nameIdx] || "";
          if (dtIdx !== -1 && !fundPeriods[cnpj]) fundPeriods[cnpj] = row[dtIdx] || "";
          if (plMedio > 0 && pl > 0) fundUnitValues[cnpj] = ((pl - plMedio) / plMedio) * 100;
          if (cotistasIdx !== -1) {
            const val = parseNum(row[cotistasIdx]);
            fundShareholders[cnpj] = Math.max(fundShareholders[cnpj] || 0, val);
          }
        }
      } else if (isTabII) {
        const cartIdx = header.indexOf("TAB_II_VL_CARTEIRA");
        for (const row of rows) {
          totalRowsParsed++;
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj)) { rowsSkippedInvalidCnpj++; continue; }
          const company = getCompany(cnpj);
          if (!company) continue;
          rowsMatched++;
          const val = parseNum(row[cartIdx]);
          if (Math.abs(val) > 1e12) { console.warn(`[anomaly] Portfolio ${val} for ${cnpj}`); anomaliesLogged++; }
          fundPortfolio[cnpj] = Math.max(fundPortfolio[cnpj] || 0, val);
        }
      } else if (isTabV) {
        console.log(`tab_V: skipping (receivables aging data)`);
      } else if (isTabVI) {
        console.log(`tab_VI: skipping (receivables aging data)`);
      } else if (isTabVII) {
        const overdueAdIdx = header.indexOf("TAB_VII_A3_2_VL_DIRCRED_VENC_AD");
        const overdueInadIdx = header.indexOf("TAB_VII_A4_2_VL_DIRCRED_VENC_INAD");
        const inadIdx = header.indexOf("TAB_VII_A5_2_VL_DIRCRED_INAD");
        for (const row of rows) {
          totalRowsParsed++;
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj)) { rowsSkippedInvalidCnpj++; continue; }
          const company = getCompany(cnpj);
          if (!company) continue;
          rowsMatched++;
          const ov = parseNum(row[overdueAdIdx]) + parseNum(row[overdueInadIdx]) + parseNum(row[inadIdx]);
          if (Math.abs(ov) > 1e12) { console.warn(`[anomaly] Overdue ${ov} for ${cnpj}`); anomaliesLogged++; }
          fundOverdue[cnpj] = (fundOverdue[cnpj] || 0) + ov;
        }
      }
    }

    console.log(`[parse-stats] totalRows=${totalRowsParsed} matched=${rowsMatched} skippedInvalidCnpj=${rowsSkippedInvalidCnpj} anomalies=${anomaliesLogged}`);

    // Fetch shareholders from CVM medidas dataset
    try {
      const medidasUrl = `https://dados.cvm.gov.br/dados/FIE/MEDIDAS/DADOS/medidas_mes_fie_${refMonth}.csv`;
      console.log(`Fetching medidas: ${medidasUrl}`);
      const medidasRes = await fetch(medidasUrl);
      if (medidasRes.ok) {
        const medidasText = await medidasRes.text();
        const medidasLines = medidasText.split("\n").filter(l => l.trim());
        if (medidasLines.length > 1) {
          const mHeader = medidasLines[0].split(";").map(h => h.trim().replace(/"/g, ""));
          const mCnpjIdx = mHeader.findIndex(h => h.includes("CNPJ"));
          const mCotistasIdx = mHeader.findIndex(h => h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("COTST"));
          if (mCnpjIdx !== -1 && mCotistasIdx !== -1) {
            for (let i = 1; i < medidasLines.length; i++) {
              const cols = medidasLines[i].split(";").map(c => c.trim().replace(/"/g, ""));
              const cnpj = cleanCnpj(cols[mCnpjIdx] || "");
              const company = getCompany(cnpj);
              if (!company) continue;
              const val = parseNum(cols[mCotistasIdx]);
              fundShareholders[cnpj] = Math.max(fundShareholders[cnpj] || 0, val);
            }
          }
        }
      } else {
        const yearStr = refMonth.substring(0, 4);
        const histUrl = `https://dados.cvm.gov.br/dados/FIE/MEDIDAS/DADOS/HIST/medidas_fie_${yearStr}.csv`;
        const histRes = await fetch(histUrl);
        if (histRes.ok) {
          const histText = await histRes.text();
          const histLines = histText.split("\n").filter(l => l.trim());
          if (histLines.length > 1) {
            const mHeader = histLines[0].split(";").map(h => h.trim().replace(/"/g, ""));
            const mCnpjIdx = mHeader.findIndex(h => h.includes("CNPJ"));
            const mCotistasIdx = mHeader.findIndex(h => h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("COTST"));
            const mDtIdx = mHeader.findIndex(h => h.includes("DT_COMPTC") || h.includes("DT_REFER"));
            const refDate = `${refMonth.substring(0, 4)}-${refMonth.substring(4, 6)}`;
            if (mCnpjIdx !== -1 && mCotistasIdx !== -1) {
              for (let i = 1; i < histLines.length; i++) {
                const cols = histLines[i].split(";").map(c => c.trim().replace(/"/g, ""));
                if (mDtIdx !== -1 && !cols[mDtIdx]?.startsWith(refDate)) continue;
                const cnpj = cleanCnpj(cols[mCnpjIdx] || "");
                const company = getCompany(cnpj);
                if (!company) continue;
                const val = parseNum(cols[mCotistasIdx]);
                fundShareholders[cnpj] = Math.max(fundShareholders[cnpj] || 0, val);
              }
            }
          }
        }
      }
    } catch (medidasErr) {
      console.log(`medidas fetch error: ${medidasErr}`);
    }

    // Build details
    let details: FundDetail[] = [];
    for (const [company, cnpjs] of Object.entries(CNPJS)) {
      for (const cnpj of cnpjs) {
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
            cash: fundCash[cnpj] || 0,
            shareholders: fundShareholders[cnpj] || 0,
          });
        }
      }
    }

    if (fundType && (fundType === "STANDARD" || fundType === "NP")) {
      details = details.filter((d) => d.fund_type === fundType);
    }

    // Aggregated results
    const results: Record<string, {
      net_assets: number; portfolio: number; overdue: number;
      delinquency: number; unit_value: number; fund_count: number;
      liabilities: number; fund_type: string; cash: number; shareholders: number;
    }> = {};
    for (const company of Object.keys(CNPJS)) {
      results[company] = { net_assets: 0, portfolio: 0, overdue: 0, delinquency: 0, unit_value: 0, fund_count: 0, liabilities: 0, fund_type: fundType || "STANDARD", cash: 0, shareholders: 0 };
    }

    for (const d of details) {
      const r = results[d.company];
      r.net_assets += d.net_assets;
      r.portfolio += d.portfolio;
      r.overdue += d.overdue;
      r.liabilities += d.liabilities;
      r.cash += d.cash;
      r.shareholders += d.shareholders;
      r.fund_count++;
      r.fund_type = d.fund_type;
      if (fundUnitValues[d.cnpj]) r.unit_value = fundUnitValues[d.cnpj];
    }

    for (const key of Object.keys(results)) {
      const r = results[key];
      if (r.portfolio === 0 && r.net_assets > 0) r.portfolio = r.net_assets * 0.85;
      r.delinquency = r.portfolio > 0 ? (r.overdue / r.portfolio) * 100 : 0;
    }

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
