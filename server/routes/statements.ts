import { Router, Request, Response } from "express";
import JSZip from "jszip";
import pool from "../db.js";

const router = Router();

const CACHE_TTL_HOURS = 24;
const FETCH_TIMEOUT_MS = 45_000;
const GLOBAL_BUDGET_MS = 55_000;

let CNPJS: Record<string, string[]> = {};
let NP_OVERRIDE: Set<string> = new Set();

async function loadCompetitors() {
  const { rows: comps } = await pool.query(
    "SELECT c.slug, cc.cnpj, cc.fund_type_override, cc.status FROM competitors c JOIN competitor_cnpjs cc ON cc.competitor_id = c.id WHERE c.status = 'active'"
  );
  const cnpjs: Record<string, string[]> = {};
  const npSet = new Set<string>();
  for (const row of comps) {
    if (row.status !== "active") continue;
    if (!cnpjs[row.slug]) cnpjs[row.slug] = [];
    cnpjs[row.slug].push(row.cnpj);
    if (row.fund_type_override === "NP") npSet.add(row.cnpj);
  }
  CNPJS = cnpjs;
  NP_OVERRIDE = npSet;
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

function getFundType(cnpj: string, name: string, tpFundo: string, condom: string): string {
  if (NP_OVERRIDE.has(cnpj)) return "NP";
  const upper = (s: string) => (s || "").toUpperCase();
  if (upper(tpFundo).includes("NP") || upper(tpFundo).includes("NAO PADRONIZADO") || upper(tpFundo).includes("NÃO PADRONIZADO")) return "NP";
  if (upper(condom).includes("NP") || upper(condom).includes("NAO PADRONIZADO") || upper(condom).includes("NÃO PADRONIZADO")) return "NP";
  if (upper(name).includes("NAO PADRONIZADO") || upper(name).includes("NÃO PADRONIZADO") || upper(name).includes(" NP ") || upper(name).endsWith(" NP")) return "NP";
  return "STANDARD";
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

function extractYYYYMM(dateStr: string): string {
  if (dateStr.includes("-")) return dateStr.substring(0, 7).replace("-", "");
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) return parts[2] + parts[1];
  }
  return "";
}

type MonthResult = Record<string, Record<string, Record<string, number | string>>>;

async function readCache(refMonth: string, fundType: string) {
  const { rows } = await pool.query(
    "SELECT parsed_payload, source_status, expires_at FROM statement_cache WHERE ref_month = $1 AND fund_type = $2",
    [refMonth, fundType]
  );
  if (rows.length === 0) return null;
  const data = rows[0];
  const isExpired = new Date(data.expires_at) < new Date();
  return { payload: data.parsed_payload as MonthResult, status: isExpired ? "stale" : data.source_status };
}

async function writeCache(refMonth: string, fundType: string, payload: MonthResult, durationMs: number, status = "fresh") {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await pool.query(
      `INSERT INTO statement_cache (ref_month, fund_type, parsed_payload, fetched_at, expires_at, source_status, fetch_duration_ms, error_detail)
       VALUES ($1, $2, $3, now(), $4, $5, $6, NULL)
       ON CONFLICT (ref_month, fund_type) DO UPDATE SET parsed_payload = $3, fetched_at = now(), expires_at = $4, source_status = $5, fetch_duration_ms = $6, error_detail = NULL`,
      [refMonth, fundType, JSON.stringify(payload), expiresAt, status, durationMs]
    );
  } catch (e) { console.error(`[cache-write] Failed:`, e); }
}

async function writeCacheError(refMonth: string, fundType: string, errorMsg: string) {
  try {
    await pool.query(
      `INSERT INTO statement_cache (ref_month, fund_type, parsed_payload, fetched_at, expires_at, source_status, error_detail)
       VALUES ($1, $2, '{}', now(), now(), 'error', $3)
       ON CONFLICT (ref_month, fund_type) DO UPDATE SET parsed_payload = '{}', fetched_at = now(), expires_at = now(), source_status = 'error', error_detail = $3`,
      [refMonth, fundType, errorMsg]
    );
  } catch (e) { console.error(`[cache-error-write] Failed:`, e); }
}

async function fetchMonthData(refMonth: string, fundType: string, budgetDeadline: number): Promise<MonthResult> {
  const remaining = budgetDeadline - Date.now();
  const timeout = Math.min(FETCH_TIMEOUT_MS, Math.max(remaining - 3000, 5000));
  const yearNum = parseInt(refMonth.substring(0, 4));
  const zipUrl = yearNum < 2019
    ? `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/HIST/inf_mensal_fidc_${yearNum}.zip`
    : `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_${refMonth}.zip`;

  console.log(`[cvm-fetch] month=${refMonth} url=${zipUrl} timeout=${timeout}ms`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response: globalThis.Response;
  try {
    response = await fetch(zipUrl, { signal: controller.signal });
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error(`TIMEOUT:${refMonth}:CVM server took too long.`);
    throw new Error(`NETWORK:${refMonth}:${e.message}`);
  }
  clearTimeout(timer);
  if (!response.ok) throw new Error(`UNAVAILABLE:${refMonth}:HTTP ${response.status}`);

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const fundData: Record<string, Record<string, number>> = {};
  const fundNames: Record<string, string> = {};
  const fundTypes: Record<string, string> = {};
  let totalRows = 0, matchedRows = 0;
  const isYearlyZip = yearNum < 2019;

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir || !filename.endsWith(".csv")) continue;
    const { header, rows } = await parseCsvFile(file);
    if (!header.length) continue;

    let cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
    if (cnpjIdx === -1) cnpjIdx = header.indexOf("CNPJ_FUNDO");
    if (cnpjIdx === -1) continue;
    if (header.includes("TAB_X_CLASSE_SERIE") || header.includes("TAB_X_TP_OPER")) continue;

    const isTabI = /tab_I[_.]/.test(filename) && !/tab_I[IVX]/.test(filename);
    const tabColumns: { name: string; idx: number }[] = [];
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (h.startsWith("TAB_") && !h.includes("CPF_CNPJ_CEDENTE") && !h.includes("PR_CEDENTE")) {
        tabColumns.push({ name: h, idx: i });
      }
    }
    if (tabColumns.length === 0) continue;

    let dtIdx = -1;
    if (isYearlyZip) {
      dtIdx = header.indexOf("DT_COMPTC");
      if (dtIdx === -1) dtIdx = header.indexOf("DT_COMPT");
    }
    const nameIdx = header.indexOf("DENOM_SOCIAL") !== -1 ? header.indexOf("DENOM_SOCIAL") : header.indexOf("NM_FUNDO_CLASSE");
    const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
    const condominioIdx = header.indexOf("CONDOM");

    for (const row of rows) {
      totalRows++;
      if (isYearlyZip && dtIdx !== -1) {
        const rowMonth = extractYYYYMM(row[dtIdx] || "");
        if (rowMonth && rowMonth !== refMonth) continue;
      }
      const cnpj = cleanCnpj(row[cnpjIdx] || "");
      if (!isValidCnpj(cnpj)) continue;
      const company = getCompany(cnpj);
      if (!company) continue;
      matchedRows++;
      if (nameIdx !== -1 && !fundNames[cnpj]) fundNames[cnpj] = row[nameIdx] || "";
      if (isTabI && !fundTypes[cnpj]) {
        fundTypes[cnpj] = getFundType(cnpj, fundNames[cnpj] || "", tpFundoIdx !== -1 ? row[tpFundoIdx] || "" : "", condominioIdx !== -1 ? row[condominioIdx] || "" : "");
      }
      if (!fundData[cnpj]) fundData[cnpj] = {};
      for (const col of tabColumns) {
        const val = parseNum(row[col.idx]);
        if (val !== 0) fundData[cnpj][col.name] = (fundData[cnpj][col.name] || 0) + val;
      }
    }
  }

  console.log(`[parse-stats] total=${totalRows} matched=${matchedRows}`);
  const result: MonthResult = {};
  for (const [cnpj, data] of Object.entries(fundData)) {
    const company = getCompany(cnpj)!;
    const type = fundTypes[cnpj] || "STANDARD";
    if (fundType && fundType !== type) continue;
    if (!result[company]) result[company] = {};
    result[company][cnpj] = { fund_name: fundNames[cnpj] || `Fund ${cnpj}`, fund_type: type, ...data };
  }
  return result;
}

/** POST /api/statements */
router.post("/", async (req: Request, res: Response) => {
  const budgetDeadline = Date.now() + GLOBAL_BUDGET_MS;
  try {
    if (req.body?.ping) return res.json({ ping: true, ts: Date.now() });

    await loadCompetitors();
    const { months, fundType } = req.body;
    if (!months || !Array.isArray(months) || months.length === 0) {
      return res.status(400).json({ error: "months must be an array of YYYYMM strings" });
    }

    const ft = fundType || "STANDARD";
    const results: Record<string, MonthResult> = {};
    const errors: Record<string, string> = {};
    const meta: Record<string, string> = {};

    for (const month of months) {
      if (Date.now() >= budgetDeadline - 3000) {
        errors[month] = `TIMEOUT:${month}:Budget exhausted.`;
        continue;
      }
      if (typeof month !== "string" || month.length !== 6) {
        errors[month] = `Invalid month format: ${month}`;
        continue;
      }
      const cached = await readCache(month, ft);
      if (cached && cached.status === "fresh" && Object.keys(cached.payload).length > 0) {
        results[month] = cached.payload;
        meta[month] = "cached";
        continue;
      }
      const start = Date.now();
      try {
        const data = await fetchMonthData(month, ft, budgetDeadline);
        results[month] = data;
        meta[month] = "live";
        writeCache(month, ft, data, Date.now() - start);
      } catch (err: any) {
        if (cached && Object.keys(cached.payload).length > 0) {
          results[month] = cached.payload;
          meta[month] = "stale";
        } else {
          errors[month] = err.message;
          writeCacheError(month, ft, err.message);
        }
      }
    }

    if (Object.keys(results).length > 0) {
      return res.json({ ...results, _meta: meta, ...(Object.keys(errors).length > 0 ? { _errors: errors } : {}) });
    }
    return res.status(502).json({ error: "All requested months failed", details: errors });
  } catch (err: any) {
    console.error("statements error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
