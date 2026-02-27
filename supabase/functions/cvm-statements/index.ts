import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CACHE_TTL_HOURS = 24;
const FETCH_TIMEOUT_MS = 45_000;
const GLOBAL_BUDGET_MS = 55_000;

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
  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir || !filename.endsWith(".csv")) continue;

    const { header, rows } = await parseCsvFile(file);
    if (!header.length) continue;

    const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
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

    const nameIdx = header.indexOf("DENOM_SOCIAL");
    const tpFundoIdx = header.indexOf("TP_FUNDO") !== -1 ? header.indexOf("TP_FUNDO") : header.indexOf("TP_FUNDO_CLASSE");
    const condominioIdx = header.indexOf("CONDOM");

    for (const row of rows) {
      const cnpj = cleanCnpj(row[cnpjIdx] || "");
      const company = getCompany(cnpj);
      if (!company) continue;
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
