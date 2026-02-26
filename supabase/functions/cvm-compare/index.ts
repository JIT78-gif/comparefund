import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

const CNPJS: Record<string, string[]> = {
  multiplica: ["23216398000101", "40211675000102"],
  red: ["17250006000110", "11489344000122"],
  atena: ["31904898000156"],
  cifra: ["08818152000108"],
  sifra: ["08678936000188", "17012019000150", "41351629000163", "42462120000150", "54889584000127", "14166140000149"],
};

const NP_OVERRIDE: Set<string> = new Set(["40211675000102", "17012019000150"]);

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
  cash: number;
  shareholders: number;
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
    const fundCash: Record<string, number> = {};
    const fundShareholders: Record<string, number> = {};
    const fundCounts: Record<string, number> = { multiplica: 0, red: 0, atena: 0, cifra: 0 };

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
        console.log(`tab_I headers: ${header.join(", ")}`);
        const nameIdx = header.indexOf("DENOM_SOCIAL");
        const dtCompetIdx = header.indexOf("DT_COMPTC");
        const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
        const condominioIdx = header.indexOf("CONDOM");
        // Cash (disponibilidades) is in Tab I as TAB_I1_VL_DISP
        const dispIdx = header.indexOf("TAB_I1_VL_DISP");
        if (dispIdx !== -1) console.log(`tab_I: found cash column TAB_I1_VL_DISP at index ${dispIdx}`);
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          const company = getCompany(cnpj);
          if (!company) continue;
          if (nameIdx !== -1) fundNames[cnpj] = row[nameIdx] || "";
          if (dtCompetIdx !== -1) fundPeriods[cnpj] = row[dtCompetIdx] || "";

          // Extract cash from Tab I
          if (dispIdx !== -1) {
            const cashVal = parseNum(row[dispIdx]);
            fundCash[cnpj] = (fundCash[cnpj] || 0) + cashVal;
          }

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
          const name = (fundNames[cnpj] || "").toUpperCase();
          if (name.includes("NAO PADRONIZADO") || name.includes("NÃO PADRONIZADO") || name.includes(" NP ") || name.endsWith(" NP")) {
            detectedType = "NP";
          }
          fundTypes[cnpj] = detectedType;
        }
      } else if (isTabIII) {
        console.log(`tab_III headers: ${header.join(", ")}`);
        const passivoIdx = header.findIndex(h =>
          h.includes("VL_PASSIVO") || h.includes("VL_PATRIM_LIQ") || h.includes("PASSIVO")
        );
        if (passivoIdx !== -1) {
          for (const row of rows) {
            const cnpj = cleanCnpj(row[cnpjIdx] || "");
            const company = getCompany(cnpj);
            if (!company) continue;
            fundLiabilities[cnpj] = (fundLiabilities[cnpj] || 0) + parseNum(row[passivoIdx]);
          }
        }
      } else if (isTabIV) {
        console.log(`tab_IV headers: ${header.join(", ")}`);
        const plIdx = header.indexOf("TAB_IV_A_VL_PL");
        const plMedioIdx = header.indexOf("TAB_IV_B_VL_PL_MEDIO");
        const nameIdx = header.indexOf("DENOM_SOCIAL");
        const dtIdx = header.indexOf("DT_COMPTC");
        // Shareholders (cotistas) - search for NR_COTST or QT_COTST
        const cotistasIdx = header.findIndex(h =>
          h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("NR_COTISTA") || h.includes("COTST")
        );
        if (cotistasIdx !== -1) console.log(`tab_IV: found shareholders column ${header[cotistasIdx]} at index ${cotistasIdx}`);
        else console.log(`tab_IV: no shareholders column found`);
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          const company = getCompany(cnpj);
          if (!company) continue;
          const pl = parseNum(row[plIdx]);
          const plMedio = plMedioIdx !== -1 ? parseNum(row[plMedioIdx]) : 0;
          fundNetAssets[cnpj] = Math.max(fundNetAssets[cnpj] || 0, pl);
          if (nameIdx !== -1 && !fundNames[cnpj]) fundNames[cnpj] = row[nameIdx] || "";
          if (dtIdx !== -1 && !fundPeriods[cnpj]) fundPeriods[cnpj] = row[dtIdx] || "";
          if (plMedio > 0 && pl > 0) {
            fundUnitValues[cnpj] = ((pl - plMedio) / plMedio) * 100;
          }
          // Extract shareholders count
          if (cotistasIdx !== -1) {
            const val = parseNum(row[cotistasIdx]);
            fundShareholders[cnpj] = Math.max(fundShareholders[cnpj] || 0, val);
          }
          fundCounts[company]++;
        }
      } else if (isTabII) {
        const cartIdx = header.indexOf("TAB_II_VL_CARTEIRA");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          const company = getCompany(cnpj);
          if (!company) continue;
          fundPortfolio[cnpj] = Math.max(fundPortfolio[cnpj] || 0, parseNum(row[cartIdx]));
        }
      } else if (isTabV) {
        // Tab V contains receivables aging data, not cash. Cash is in Tab I.
        console.log(`tab_V: skipping (receivables aging data)`);
      } else if (isTabVI) {
        // Tab VI contains receivables aging data, not shareholders. Shareholders searched in Tab IV.
        console.log(`tab_VI: skipping (receivables aging data)`);
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

    // Fetch shareholders from CVM medidas dataset (separate from monthly report)
    try {
      const medidasUrl = `https://dados.cvm.gov.br/dados/FIE/MEDIDAS/DADOS/medidas_mes_fie_${refMonth}.csv`;
      console.log(`Fetching medidas: ${medidasUrl}`);
      const medidasRes = await fetch(medidasUrl);
      if (medidasRes.ok) {
        const medidasText = await medidasRes.text();
        const medidasLines = medidasText.split("\n").filter(l => l.trim());
        if (medidasLines.length > 1) {
          const mHeader = medidasLines[0].split(";").map(h => h.trim().replace(/"/g, ""));
          console.log(`medidas headers: ${mHeader.join(", ")}`);
          const mCnpjIdx = mHeader.findIndex(h => h.includes("CNPJ"));
          const mCotistasIdx = mHeader.findIndex(h => h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("COTST"));
          console.log(`medidas: CNPJ idx=${mCnpjIdx}, cotistas idx=${mCotistasIdx} (${mCotistasIdx >= 0 ? mHeader[mCotistasIdx] : 'not found'})`);
          if (mCnpjIdx !== -1 && mCotistasIdx !== -1) {
            for (let i = 1; i < medidasLines.length; i++) {
              const cols = medidasLines[i].split(";").map(c => c.trim().replace(/"/g, ""));
              const cnpj = cleanCnpj(cols[mCnpjIdx] || "");
              const company = getCompany(cnpj);
              if (!company) continue;
              const val = parseNum(cols[mCotistasIdx]);
              fundShareholders[cnpj] = Math.max(fundShareholders[cnpj] || 0, val);
              console.log(`medidas: ${company} CNPJ ${cnpj} shareholders=${val}`);
            }
          }
        }
      } else {
        console.log(`medidas: HTTP ${medidasRes.status} - trying historical format`);
        // Try historical format
        const yearStr = refMonth.substring(0, 4);
        const histUrl = `https://dados.cvm.gov.br/dados/FIE/MEDIDAS/DADOS/HIST/medidas_fie_${yearStr}.csv`;
        console.log(`Fetching historical medidas: ${histUrl}`);
        const histRes = await fetch(histUrl);
        if (histRes.ok) {
          const histText = await histRes.text();
          const histLines = histText.split("\n").filter(l => l.trim());
          if (histLines.length > 1) {
            const mHeader = histLines[0].split(";").map(h => h.trim().replace(/"/g, ""));
            console.log(`hist medidas headers: ${mHeader.join(", ")}`);
            const mCnpjIdx = mHeader.findIndex(h => h.includes("CNPJ"));
            const mCotistasIdx = mHeader.findIndex(h => h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("COTST"));
            const mDtIdx = mHeader.findIndex(h => h.includes("DT_COMPTC") || h.includes("DT_REFER"));
            // Filter by refMonth
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
        } else {
          console.log(`hist medidas: HTTP ${histRes.status}`);
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
      if (fundUnitValues[d.cnpj]) {
        r.unit_value = fundUnitValues[d.cnpj];
      }
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
