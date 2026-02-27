import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { refMonth } = await req.json();
    const month = refMonth || "202406";

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

    // Non-financial columns to exclude
    const EXCLUDED_PREFIXES = [
      "CNPJ", "DENOM", "DT_", "TP_", "ADMIN", "CONDOM", "PR_",
      "CPF", "NM_", "CLASSE", "CD_", "SK_", "ID_",
    ];

    const result: Record<string, string[]> = {};

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;

      const text = await file.async("text");
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) continue;

      const headers = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));

      // Filter to TAB_* columns or VL_/QT_ columns, excluding non-financial
      const tabColumns = headers.filter((h) => {
        if (!h) return false;
        const isExcluded = EXCLUDED_PREFIXES.some((p) => h.startsWith(p));
        if (isExcluded) return false;
        // Include columns that look like data columns
        return h.startsWith("TAB_") || h.startsWith("VL_") || h.startsWith("QT_") || 
               h.includes("_VL_") || h.includes("_QT_") || h.includes("_TX_") || h.includes("_PC_");
      });

      // Extract tab identifier from filename
      const shortName = filename.split("/").pop() || filename;

      if (tabColumns.length > 0) {
        result[shortName] = tabColumns.sort();
      }
    }

    // Also provide a flat list of all files found
    const allFiles = Object.keys(zip.files)
      .filter((f) => !zip.files[f].dir && f.endsWith(".csv"))
      .map((f) => f.split("/").pop() || f);

    return new Response(JSON.stringify({ 
      month,
      allFiles,
      columnsByFile: result,
      totalColumns: Object.values(result).reduce((sum, cols) => sum + cols.length, 0),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
