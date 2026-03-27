import { Router, Request, Response } from "express";
import JSZip from "jszip";
import pool from "../db.js";

const router = Router();

let CNPJS: Record<string, string[]> = {};
let NP_OVERRIDE: Set<string> = new Set();

let ALL_COMPETITOR_SLUGS: string[] = [];

async function loadCompetitors() {
  const [cnpjRows, slugRows] = await Promise.all([
    pool.query(
      "SELECT c.slug, cc.cnpj, cc.fund_type_override, cc.status FROM competitors c JOIN competitor_cnpjs cc ON cc.competitor_id = c.id WHERE c.status = 'active'"
    ),
    pool.query("SELECT slug FROM competitors WHERE status = 'active'"),
  ]);
  const cnpjs: Record<string, string[]> = {};
  const npSet = new Set<string>();
  for (const row of cnpjRows.rows) {
    if (row.status !== "active") continue;
    if (!cnpjs[row.slug]) cnpjs[row.slug] = [];
    cnpjs[row.slug].push(row.cnpj);
    if (row.fund_type_override === "NP") npSet.add(row.cnpj);
  }
  CNPJS = cnpjs;
  NP_OVERRIDE = npSet;
  ALL_COMPETITOR_SLUGS = slugRows.rows.map((r: any) => r.slug);
}

function cleanCnpj(raw: string): string { return raw.replace(/[.\-\/]/g, ""); }
function parseNum(val: string | undefined): number {
  if (!val) return 0;
  let cleaned = val.replace(/"/g, "").trim();
  const isNeg = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isNeg) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(",", ".");
  const parts = cleaned.split(".");
  if (parts.length > 2) { const last = parts.pop()!; cleaned = parts.join("") + "." + last; }
  const num = parseFloat(cleaned) || 0;
  return isNeg ? -num : num;
}
function isValidCnpj(cnpj: string): boolean { return /^\d{14}$/.test(cnpj); }
function getCompany(cnpj: string): string | null {
  const clean = cleanCnpj(cnpj);
  for (const [company, cnpjs] of Object.entries(CNPJS)) {
    if (cnpjs.includes(clean)) return company;
  }
  return null;
}

async function parseCsvFile(file: JSZip.JSZipObject) {
  const bytes = await file.async("uint8array");
  const text = new TextDecoder("latin1").decode(bytes);
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { header: [] as string[], rows: [] as string[][] };
  const header = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
  const rows = lines.slice(1).map((l) => l.split(";").map((c) => c.trim().replace(/"/g, "")));
  return { header, rows };
}

/** POST /api/compare */
router.post("/", async (req: Request, res: Response) => {
  try {
    await loadCompetitors();
    const { refMonth, fundType } = req.body;
    if (!refMonth || refMonth.length !== 6) {
      return res.status(400).json({ error: "refMonth must be YYYYMM format" });
    }

    const yearNum = parseInt(refMonth.substring(0, 4));
    const zipUrl = yearNum < 2019
      ? `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/HIST/inf_mensal_fidc_${yearNum}.zip`
      : `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_${refMonth}.zip`;

    const response = await fetch(zipUrl);
    if (!response.ok) return res.status(404).json({ error: `Data not available for ${refMonth}` });

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

    const targetTables = ["tab_I", "tab_II", "tab_III", "tab_IV", "tab_V", "tab_VI", "tab_VII"];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;
      const isTarget = targetTables.some((t) => filename.includes(`_${t}_`) || filename.endsWith(`_${t}.csv`));
      if (!isTarget) continue;

      const { header, rows } = await parseCsvFile(file);
      if (!header.length) continue;

      let cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      if (cnpjIdx === -1) cnpjIdx = header.indexOf("CNPJ_FUNDO");
      if (cnpjIdx === -1) continue;

      const isTabI = (filename.includes("tab_I_") || filename.endsWith("tab_I.csv")) && !filename.includes("tab_II") && !filename.includes("tab_IV") && !filename.includes("tab_VII") && !filename.includes("tab_III") && !filename.includes("tab_V") && !filename.includes("tab_VI");
      const isTabII = filename.includes("tab_II") && !filename.includes("tab_III");
      const isTabIII = filename.includes("tab_III");
      const isTabIV = filename.includes("tab_IV");
      const isTabVII = filename.includes("tab_VII");

      if (isTabI) {
        const nameIdx = header.indexOf("DENOM_SOCIAL") !== -1 ? header.indexOf("DENOM_SOCIAL") : header.indexOf("NM_FUNDO_CLASSE");
        const dtCompetIdx = header.indexOf("DT_COMPTC") !== -1 ? header.indexOf("DT_COMPTC") : header.indexOf("DT_COMPT");
        const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
        const condominioIdx = header.indexOf("CONDOM");
        const dispIdx = header.indexOf("TAB_I1_VL_DISP");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj) || !getCompany(cnpj)) continue;
          if (nameIdx !== -1) fundNames[cnpj] = row[nameIdx] || "";
          if (dtCompetIdx !== -1) fundPeriods[cnpj] = row[dtCompetIdx] || "";
          if (dispIdx !== -1) fundCash[cnpj] = (fundCash[cnpj] || 0) + parseNum(row[dispIdx]);
          let detectedType = NP_OVERRIDE.has(cnpj) ? "NP" : "STANDARD";
          if (tpFundoIdx !== -1) { const tp = (row[tpFundoIdx] || "").toUpperCase(); if (tp.includes("NP") || tp.includes("NAO PADRONIZADO") || tp.includes("NÃO PADRONIZADO")) detectedType = "NP"; }
          if (condominioIdx !== -1) { const cond = (row[condominioIdx] || "").toUpperCase(); if (cond.includes("NP") || cond.includes("NAO PADRONIZADO") || cond.includes("NÃO PADRONIZADO")) detectedType = "NP"; }
          const name = (fundNames[cnpj] || "").toUpperCase();
          if (name.includes("NAO PADRONIZADO") || name.includes("NÃO PADRONIZADO") || name.includes(" NP ") || name.endsWith(" NP")) detectedType = "NP";
          fundTypes[cnpj] = detectedType;
        }
      } else if (isTabIII) {
        const passivoIdx = header.findIndex(h => h.includes("VL_PASSIVO") || h.includes("VL_PATRIM_LIQ") || h.includes("PASSIVO"));
        if (passivoIdx !== -1) {
          for (const row of rows) {
            const cnpj = cleanCnpj(row[cnpjIdx] || "");
            if (!isValidCnpj(cnpj) || !getCompany(cnpj)) continue;
            fundLiabilities[cnpj] = (fundLiabilities[cnpj] || 0) + parseNum(row[passivoIdx]);
          }
        }
      } else if (isTabIV) {
        const plIdx = header.indexOf("TAB_IV_A_VL_PL");
        const plMedioIdx = header.indexOf("TAB_IV_B_VL_PL_MEDIO");
        const cotistasIdx = header.findIndex(h => h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("NR_COTISTA") || h.includes("COTST"));
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj) || !getCompany(cnpj)) continue;
          const pl = parseNum(row[plIdx]);
          const plMedio = plMedioIdx !== -1 ? parseNum(row[plMedioIdx]) : 0;
          fundNetAssets[cnpj] = Math.max(fundNetAssets[cnpj] || 0, pl);
          if (plMedio > 0 && pl > 0) fundUnitValues[cnpj] = ((pl - plMedio) / plMedio) * 100;
          if (cotistasIdx !== -1) fundShareholders[cnpj] = Math.max(fundShareholders[cnpj] || 0, parseNum(row[cotistasIdx]));
        }
      } else if (isTabII) {
        const cartIdx = header.indexOf("TAB_II_VL_CARTEIRA");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj) || !getCompany(cnpj)) continue;
          fundPortfolio[cnpj] = Math.max(fundPortfolio[cnpj] || 0, parseNum(row[cartIdx]));
        }
      } else if (isTabVII) {
        const overdueAdIdx = header.indexOf("TAB_VII_A3_2_VL_DIRCRED_VENC_AD");
        const overdueInadIdx = header.indexOf("TAB_VII_A4_2_VL_DIRCRED_VENC_INAD");
        const inadIdx = header.indexOf("TAB_VII_A5_2_VL_DIRCRED_INAD");
        for (const row of rows) {
          const cnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!isValidCnpj(cnpj) || !getCompany(cnpj)) continue;
          fundOverdue[cnpj] = (fundOverdue[cnpj] || 0) + parseNum(row[overdueAdIdx]) + parseNum(row[overdueInadIdx]) + parseNum(row[inadIdx]);
        }
      }
    }

    // Medidas (shareholders)
    try {
      const medidasUrl = `https://dados.cvm.gov.br/dados/FIE/MEDIDAS/DADOS/medidas_mes_fie_${refMonth}.csv`;
      const medidasRes = await fetch(medidasUrl);
      if (medidasRes.ok) {
        const buf = await medidasRes.arrayBuffer();
        const text = new TextDecoder("latin1").decode(buf);
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length > 1) {
          const mHeader = lines[0].split(";").map(h => h.trim().replace(/"/g, ""));
          const mCnpjIdx = mHeader.findIndex(h => h.includes("CNPJ"));
          const mCotIdx = mHeader.findIndex(h => h.includes("NR_COTST") || h.includes("QT_COTST") || h.includes("COTST"));
          if (mCnpjIdx !== -1 && mCotIdx !== -1) {
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(";").map(c => c.trim().replace(/"/g, ""));
              const cnpj = cleanCnpj(cols[mCnpjIdx] || "");
              if (!getCompany(cnpj)) continue;
              fundShareholders[cnpj] = Math.max(fundShareholders[cnpj] || 0, parseNum(cols[mCotIdx]));
            }
          }
        }
      }
    } catch { /* ignore */ }

    // Build details
    interface FundDetail { company: string; fund_name: string; cnpj: string; period: string; net_assets: number; portfolio: number; liabilities: number; overdue: number; fund_type: string; cash: number; shareholders: number; }
    let details: FundDetail[] = [];
    for (const [company, cnpjs] of Object.entries(CNPJS)) {
      for (const cnpj of cnpjs) {
        if (fundNetAssets[cnpj] || fundPortfolio[cnpj]) {
          details.push({
            company, fund_name: fundNames[cnpj] || `Fund ${cnpj}`, cnpj,
            period: fundPeriods[cnpj] || refMonth, net_assets: fundNetAssets[cnpj] || 0,
            portfolio: fundPortfolio[cnpj] || 0, liabilities: fundLiabilities[cnpj] || 0,
            overdue: fundOverdue[cnpj] || 0, fund_type: fundTypes[cnpj] || "STANDARD",
            cash: fundCash[cnpj] || 0, shareholders: fundShareholders[cnpj] || 0,
          });
        }
      }
    }
    if (fundType && (fundType === "STANDARD" || fundType === "NP")) {
      details = details.filter((d) => d.fund_type === fundType);
    }

    const results: Record<string, any> = {};
    for (const company of ALL_COMPETITOR_SLUGS) {
      results[company] = { net_assets: 0, portfolio: 0, overdue: 0, delinquency: 0, unit_value: 0, fund_count: 0, liabilities: 0, fund_type: fundType || "STANDARD", cash: 0, shareholders: 0 };
    }
    for (const d of details) {
      const r = results[d.company];
      r.net_assets += d.net_assets; r.portfolio += d.portfolio; r.overdue += d.overdue;
      r.liabilities += d.liabilities; r.cash += d.cash; r.shareholders += d.shareholders;
      r.fund_count++; r.fund_type = d.fund_type;
      if (fundUnitValues[d.cnpj]) r.unit_value = fundUnitValues[d.cnpj];
    }
    for (const key of Object.keys(results)) {
      const r = results[key];
      if (r.portfolio === 0 && r.net_assets > 0) r.portfolio = r.net_assets * 0.85;
      r.delinquency = r.portfolio > 0 ? (r.overdue / r.portfolio) * 100 : 0;
    }

    return res.json({ ...results, details });
  } catch (err: any) {
    console.error("compare error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
