import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

interface DiscoverMatch {
  cnpj: string;
  name: string;
  admin: string;
  tp_fundo_classe: string;
  condom: string;
}

function matchesText(searchText: string, terms: string[]): boolean {
  for (const term of terms) {
    const words = term.toUpperCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (words.every((w) => searchText.includes(w))) return true;
  }
  return false;
}

function matchesCnpj(rowCnpj: string, cnpjSearch: string[]): boolean {
  if (cnpjSearch.length === 0) return false;
  return cnpjSearch.some((c) => rowCnpj === c || rowCnpj.startsWith(c) || c.startsWith(rowCnpj));
}

function isTabFile(filename: string, tab: string): boolean {
  const pattern = new RegExp(`tab_${tab}[_.]`, "i");
  const exclude = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
    .filter((t) => t !== tab);
  if (!pattern.test(filename)) return false;
  return !exclude.some((t) => filename.includes(`tab_${t}`));
}

async function scanCsvForMatches(
  zip: JSZip,
  tabFilter: (filename: string) => boolean,
  cnpjSearch: string[],
  terms: string[],
  field: string,
  limit: number,
  seen: Map<string, DiscoverMatch>
): Promise<number> {
  let totalScanned = 0;

  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir || !filename.endsWith(".csv")) continue;
    if (!tabFilter(filename)) continue;

    console.log(`Parsing: ${filename}`);
    const text = await file.async("text");
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) continue;

    const header = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
    const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
    const nameIdx = header.indexOf("DENOM_SOCIAL");
    const adminIdx = header.indexOf("ADMIN");
    const tpIdx = header.indexOf("TP_FUNDO_CLASSE") !== -1
      ? header.indexOf("TP_FUNDO_CLASSE")
      : header.indexOf("TP_FUNDO");
    const condIdx = header.indexOf("CONDOM");

    if (cnpjIdx === -1) continue;

    for (let i = 1; i < lines.length; i++) {
      if (seen.size >= limit) break;
      const row = lines[i].split(";").map((c) => c.trim().replace(/"/g, ""));
      const rowCnpj = cleanCnpj(row[cnpjIdx] || "");
      if (!rowCnpj || !/^\d{11,14}$/.test(rowCnpj)) continue;
      totalScanned++;

      if (seen.has(rowCnpj)) continue;

      const name = (row[nameIdx] || "").toUpperCase();
      const admin = adminIdx !== -1 ? (row[adminIdx] || "").toUpperCase() : "";

      let searchText = "";
      if (field === "NAME") searchText = name;
      else if (field === "ADMIN") searchText = admin;
      else searchText = name + " " + admin;

      const cnpjMatched = matchesCnpj(rowCnpj, cnpjSearch);
      const textMatched = terms.length > 0 && matchesText(searchText, terms);

      if (cnpjMatched || (cnpjSearch.length === 0 && textMatched)) {
        seen.set(rowCnpj, {
          cnpj: rowCnpj,
          name: row[nameIdx] || "",
          admin: adminIdx !== -1 ? row[adminIdx] || "" : "",
          tp_fundo_classe: tpIdx !== -1 ? row[tpIdx] || "" : "",
          condom: condIdx !== -1 ? row[condIdx] || "" : "",
        });
      }
    }
    if (seen.size >= limit) break;
  }
  return totalScanned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { refMonth, searchTerms, searchField, searchCnpjs, limit: rawLimit } = await req.json();
    const month = refMonth || "202406";
    const terms: string[] = (searchTerms || []).filter((t: string) => t.trim());
    const field = searchField || "ALL";
    const cnpjSearch: string[] = (searchCnpjs || []).map((c: string) => cleanCnpj(c));
    const limit = Math.min(Math.max(rawLimit || 100, 1), 500);

    if (terms.length === 0 && cnpjSearch.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide searchTerms or searchCnpjs" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const yearNum = parseInt(month.substring(0, 4));
    const zipUrl = yearNum < 2019
      ? `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/HIST/inf_mensal_fidc_${yearNum}.zip`
      : `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_${month}.zip`;

    console.log(`Fetching: ${zipUrl}`);
    const response = await fetch(zipUrl);
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `CVM returned ${response.status}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const seen = new Map<string, DiscoverMatch>();

    // Primary: scan Tab I
    const tabIScanned = await scanCsvForMatches(
      zip,
      (fn) => {
        const base = fn.toLowerCase();
        return (base.includes("tab_i_") || base.endsWith("tab_i.csv")) &&
          !base.includes("tab_ii") && !base.includes("tab_iv") &&
          !base.includes("tab_vii") && !base.includes("tab_iii") &&
          !base.includes("tab_v") && !base.includes("tab_vi") &&
          !base.includes("tab_ix") && !base.includes("tab_x");
      },
      cnpjSearch, terms, field, limit, seen
    );

    // Fallback: if Tab I yielded few results, also scan Tab IV
    if (seen.size < limit && seen.size < 5) {
      console.log(`Tab I returned ${seen.size} results, scanning Tab IV as fallback`);
      await scanCsvForMatches(
        zip,
        (fn) => fn.toLowerCase().includes("tab_iv"),
        cnpjSearch, terms, field, limit, seen
      );
    }

    const matches = Array.from(seen.values());
    console.log(`Found ${matches.length} unique matches (scanned ${tabIScanned} Tab I rows)`);

    return new Response(JSON.stringify({ matches, total_matches: matches.length, limit }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
