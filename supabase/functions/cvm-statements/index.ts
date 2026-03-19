import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CACHE_TTL_HOURS = 24;
const FETCH_TIMEOUT_MS = 45_000;
const GLOBAL_BUDGET_MS = 55_000;

// Dynamic competitor data — loaded from DB at request time
let CNPJS: Record<string, string[]> = {};
let NP_OVERRIDE: Set<string> = new Set();

async function loadCompetitors() {
  const { data, error } = await supabase
    .from("competitors")
    .select("slug, competitor_cnpjs(cnpj, fund_type_override, status)")
    .eq("status", "active");
  if (error) {
    console.error("[loadCompetitors] DB error, using empty dict:", error.message);
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
  console.log(`[loadCompetitors] Loaded ${Object.keys(CNPJS).length} competitors, ${NP_OVERRIDE.size} NP overrides`);
}

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  let cleaned = val.replace(/"/g, "").trim();
  const isNeg = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isNeg) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(",", ".");
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
  const bytes = await file.async("uint8array");
  const text = new TextDecoder("latin1").decode(bytes);
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { header: [], rows: [] };
  const header = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
  const rows = lines.slice(1).map((l) => l.split(";").map((c) => c.trim().replace(/"/g, "")));
  return { header, rows };
}

type MonthResult = Record<string, Record<string, Record<string, number | string>>>;

// ── Cache helpers ──────────────────────────────────────────────

async function readCache(refMonth: string, fundType: string): Promise<{ payload: MonthResult; status: string } | null> {
  const { data, error } = await supabase
    .from("statement_cache")
    .select("parsed_payload, source_status, expires_at")
    .eq("ref_month", refMonth)
    .eq("fund_type", fundType)
    .maybeSingle();

  if (error || !data) return null;
  const isExpired = new Date(data.expires_at) < new Date();
  return {
    payload: data.parsed_payload as MonthResult,
    status: isExpired ? "stale" : data.source_status,
  };
}

async function writeCache(refMonth: string, fundType: string, payload: MonthResult, durationMs: number, status = "fresh") {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from("statement_cache")
      .upsert(
        {
          ref_month: refMonth,
          fund_type: fundType,
          parsed_payload: payload,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt,
          source_status: status,
          fetch_duration_ms: durationMs,
          error_detail: null,
        },
        { onConflict: "ref_month,fund_type" }
      );
  } catch (e) {
    console.error(`[cache-write] Failed for ${refMonth}/${fundType}:`, e);
  }
}

async function writeCacheError(refMonth: string, fundType: string, errorMsg: string) {
  try {
    await supabase
      .from("statement_cache")
      .upsert(
        {
          ref_month: refMonth,
          fund_type: fundType,
          parsed_payload: {},
          fetched_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
          source_status: "error",
          error_detail: errorMsg,
        },
        { onConflict: "ref_month,fund_type" }
      );
  } catch (e) {
    console.error(`[cache-error-write] Failed for ${refMonth}/${fundType}:`, e);
  }
}

// ── CVM fetch ──────────────────────────────────────────────────

function extractYYYYMM(dateStr: string): string {
  // Handles "YYYY-MM-DD" or "DD/MM/YYYY" formats
  if (dateStr.includes("-")) return dateStr.substring(0, 7).replace("-", "");
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) return parts[2] + parts[1];
  }
  return "";
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
  let response: Response;
  try {
    response = await fetch(zipUrl, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`TIMEOUT:${refMonth}:CVM server took too long to respond.`);
    }
    throw new Error(`NETWORK:${refMonth}:${e instanceof Error ? e.message : String(e)}`);
  }
  clearTimeout(timer);
  if (!response.ok) {
    throw new Error(`UNAVAILABLE:${refMonth}:Data not available (HTTP ${response.status}).`);
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());

  const fundData: Record<string, Record<string, number>> = {};
  const fundNames: Record<string, string> = {};
  const fundTypes: Record<string, string> = {};
  let totalRows = 0, matchedRows = 0, skippedCnpj = 0, anomalies = 0;

  const isYearlyZip = yearNum < 2019;

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir || !filename.endsWith(".csv")) continue;

    const { header, rows } = await parseCsvFile(file);
    if (!header.length) continue;

    // Support both new (CNPJ_FUNDO_CLASSE) and legacy (CNPJ_FUNDO) column names
    let cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
    if (cnpjIdx === -1) cnpjIdx = header.indexOf("CNPJ_FUNDO");
    if (cnpjIdx === -1) continue;

    // Skip per-subclass Tab X files (data per senior/subordinado/mezanino)
    if (header.includes("TAB_X_CLASSE_SERIE") || header.includes("TAB_X_TP_OPER")) continue;

    // Detect Tab I files for fund type classification
    const isTabI = /tab_I[_.]/.test(filename) && !/tab_I[IVX]/.test(filename);

    const tabColumns: { name: string; idx: number }[] = [];
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (h.startsWith("TAB_") && !h.includes("CPF_CNPJ_CEDENTE") && !h.includes("PR_CEDENTE")) {
        tabColumns.push({ name: h, idx: i });
      }
    }
    if (tabColumns.length === 0) continue;

    // For yearly ZIPs, find the date column to filter by requested month
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

      // Filter by month for yearly ZIPs
      if (isYearlyZip && dtIdx !== -1) {
        const rowMonth = extractYYYYMM(row[dtIdx] || "");
        if (rowMonth && rowMonth !== refMonth) continue;
      }

      const cnpj = cleanCnpj(row[cnpjIdx] || "");
      if (!isValidCnpj(cnpj)) { skippedCnpj++; continue; }
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
        if (Math.abs(val) > 1e12) { console.warn(`[anomaly] ${col.name}=${val} cnpj=${cnpj}`); anomalies++; }
        if (val !== 0) fundData[cnpj][col.name] = (fundData[cnpj][col.name] || 0) + val;
      }
    }
  }

  console.log(`[parse-stats] total=${totalRows} matched=${matchedRows} skippedCnpj=${skippedCnpj} anomalies=${anomalies}`);

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

// ── Main handler ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const budgetDeadline = Date.now() + GLOBAL_BUDGET_MS;

  try {
    const body = await req.json();

    // Health/ping endpoint
    if (body?.ping) {
      console.log(`[${requestId}] ping`);
      return new Response(
        JSON.stringify({ ping: true, ts: Date.now() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load competitors from DB
    await loadCompetitors();

    const { months, fundType } = body;

    if (!months || !Array.isArray(months) || months.length === 0) {
      return new Response(
        JSON.stringify({ error: "months must be an array of YYYYMM strings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ft = fundType || "STANDARD";
    console.log(`[${requestId}] START months=${JSON.stringify(months)} fundType=${ft}`);

    const results: Record<string, MonthResult> = {};
    const errors: Record<string, string> = {};
    const meta: Record<string, string> = {};

    const processMonth = async (month: string) => {
      if (typeof month !== "string" || month.length !== 6) {
        errors[month] = `Invalid month format: ${month}. Must be YYYYMM`;
        return;
      }

      // 1) Try cache first
      const cached = await readCache(month, ft);
      if (cached && cached.status === "fresh" && Object.keys(cached.payload).length > 0) {
        console.log(`[${requestId}] CACHE HIT fresh ${month}/${ft}`);
        results[month] = cached.payload;
        meta[month] = "cached";
        return;
      }

      // 2) Try live fetch
      const start = Date.now();
      try {
        const data = await fetchMonthData(month, ft, budgetDeadline);
        const duration = Date.now() - start;
        console.log(`[${requestId}] FETCH OK ${month} ${duration}ms`);
        results[month] = data;
        meta[month] = "live";
        // Write to cache in background (don't block response)
        writeCache(month, ft, data, duration);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[${requestId}] FETCH FAIL ${month}: ${errMsg}`);

        // 3) Fallback to stale cache (any cache, even expired)
        if (cached && Object.keys(cached.payload).length > 0) {
          console.log(`[${requestId}] STALE FALLBACK ${month}/${ft}`);
          results[month] = cached.payload;
          meta[month] = "stale";
        } else {
          errors[month] = errMsg;
          writeCacheError(month, ft, errMsg);
        }
      }
    };

    for (const month of months) {
      if (Date.now() >= budgetDeadline - 3000) {
        console.warn(`[${requestId}] BUDGET EXHAUSTED at ${month}`);
        errors[month] = `TIMEOUT:${month}:Execution budget exhausted.`;
        continue;
      }
      await processMonth(month);
    }

    if (Object.keys(results).length > 0) {
      console.log(`[${requestId}] DONE results=${Object.keys(results).join(",")} meta=${JSON.stringify(meta)} errors=${Object.keys(errors).join(",") || "none"}`);
      return new Response(
        JSON.stringify({
          ...results,
          _meta: meta,
          ...(Object.keys(errors).length > 0 ? { _errors: errors } : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error(`[${requestId}] ALL FAILED errors=${JSON.stringify(errors)}`);
    return new Response(
      JSON.stringify({ error: "All requested months failed", details: errors }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[${requestId}] UNHANDLED:`, err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
