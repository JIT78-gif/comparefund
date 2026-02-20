import { corsHeaders } from "../_shared/cors.ts";
import JSZip from "npm:jszip@3.10.1";

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { refMonth, searchTerms, searchField, searchCnpjs } = await req.json();
    const month = refMonth || "202406";
    const terms: string[] = searchTerms || ["ATENA", "CIFRA"];
    const field = searchField || "ALL"; // "NAME", "ADMIN", "ALL"
    const cnpjSearch: string[] = (searchCnpjs || []).map((c: string) => c.replace(/[.\-\/]/g, ""));

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
    const matches: { cnpj: string; name: string; admin: string; tp_fundo_classe: string; condom: string }[] = [];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;
      const isTabI = (filename.includes("tab_I_") || filename.endsWith("tab_I.csv")) &&
        !filename.includes("tab_II") && !filename.includes("tab_IV") &&
        !filename.includes("tab_VII") && !filename.includes("tab_III");
      if (!isTabI) continue;

      console.log(`Parsing: ${filename}`);
      const text = await file.async("text");
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) continue;
      const header = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
      const cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      const nameIdx = header.indexOf("DENOM_SOCIAL");
      const adminIdx = header.indexOf("ADMIN");
      const tpIdx = header.indexOf("TP_FUNDO_CLASSE") !== -1 ? header.indexOf("TP_FUNDO_CLASSE") : header.indexOf("TP_FUNDO");
      const condIdx = header.indexOf("CONDOM");

      console.log(`Headers available: ADMIN=${adminIdx !== -1}, NAME=${nameIdx !== -1}`);

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(";").map((c) => c.trim().replace(/"/g, ""));
        const name = (row[nameIdx] || "").toUpperCase();
        const admin = adminIdx !== -1 ? (row[adminIdx] || "").toUpperCase() : "";
        
        let searchText = "";
        if (field === "NAME") searchText = name;
        else if (field === "ADMIN") searchText = admin;
        else searchText = name + " " + admin;

        const rowCnpj = cleanCnpj(row[cnpjIdx] || "");
        
        // Match by CNPJ list or by text search
        const cnpjMatched = cnpjSearch.length > 0 && cnpjSearch.includes(rowCnpj);
        const textMatched = terms.length > 0 && terms.some((t) => searchText.includes(t.toUpperCase()));
        
        if (cnpjMatched || (cnpjSearch.length === 0 && textMatched)) {
          matches.push({
            cnpj: rowCnpj,
            name: row[nameIdx] || "",
            admin: adminIdx !== -1 ? row[adminIdx] || "" : "",
            tp_fundo_classe: tpIdx !== -1 ? row[tpIdx] || "" : "",
            condom: condIdx !== -1 ? row[condIdx] || "" : "",
          });
        }
      }
    }

    console.log(`Found ${matches.length} matches:`, JSON.stringify(matches, null, 2));

    return new Response(JSON.stringify({ matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
