import { Router, Request, Response } from "express";
import JSZip from "jszip";

const router = Router();

function cleanCnpj(raw: string): string { return raw.replace(/[.\-\/]/g, ""); }

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

interface DiscoverMatch { cnpj: string; name: string; admin: string; tp_fundo_classe: string; condom: string; }

/** POST /api/discover */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { refMonth, searchTerms, searchField, searchCnpjs, limit: rawLimit } = req.body;
    const month = refMonth || "202406";
    const terms: string[] = (searchTerms || []).filter((t: string) => t.trim());
    const field = searchField || "ALL";
    const cnpjSearch: string[] = (searchCnpjs || []).map((c: string) => cleanCnpj(c));
    const limit = Math.min(Math.max(rawLimit || 100, 1), 500);

    if (terms.length === 0 && cnpjSearch.length === 0) {
      return res.status(400).json({ error: "Provide searchTerms or searchCnpjs" });
    }

    const yearNum = parseInt(month.substring(0, 4));
    const zipUrl = yearNum < 2019
      ? `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/HIST/inf_mensal_fidc_${yearNum}.zip`
      : `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_${month}.zip`;

    const response = await fetch(zipUrl);
    if (!response.ok) return res.status(404).json({ error: `CVM returned ${response.status}` });

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const seen = new Map<string, DiscoverMatch>();

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith(".csv")) continue;
      const base = filename.toLowerCase();
      const isTabI = (base.includes("tab_i_") || base.endsWith("tab_i.csv")) && !base.includes("tab_ii") && !base.includes("tab_iv") && !base.includes("tab_vii") && !base.includes("tab_iii") && !base.includes("tab_v") && !base.includes("tab_vi") && !base.includes("tab_ix") && !base.includes("tab_x");
      if (!isTabI) continue;

      const text = await file.async("text");
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) continue;
      const header = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
      let cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
      if (cnpjIdx === -1) cnpjIdx = header.indexOf("CNPJ_FUNDO");
      const nameIdx = header.indexOf("DENOM_SOCIAL") !== -1 ? header.indexOf("DENOM_SOCIAL") : header.indexOf("NM_FUNDO_CLASSE");
      const adminIdx = header.indexOf("ADMIN");
      const tpIdx = header.indexOf("TP_FUNDO_CLASSE") !== -1 ? header.indexOf("TP_FUNDO_CLASSE") : header.indexOf("TP_FUNDO");
      const condIdx = header.indexOf("CONDOM");
      if (cnpjIdx === -1) continue;

      for (let i = 1; i < lines.length; i++) {
        if (seen.size >= limit) break;
        const row = lines[i].split(";").map((c) => c.trim().replace(/"/g, ""));
        const rowCnpj = cleanCnpj(row[cnpjIdx] || "");
        if (!rowCnpj || !/^\d{11,14}$/.test(rowCnpj)) continue;
        if (seen.has(rowCnpj)) continue;

        const name = (row[nameIdx] || "").toUpperCase();
        const admin = adminIdx !== -1 ? (row[adminIdx] || "").toUpperCase() : "";
        let searchText = field === "NAME" ? name : field === "ADMIN" ? admin : name + " " + admin;

        const cnpjMatched = matchesCnpj(rowCnpj, cnpjSearch);
        const textMatched = terms.length > 0 && matchesText(searchText, terms);

        if (cnpjMatched || (cnpjSearch.length === 0 && textMatched)) {
          seen.set(rowCnpj, {
            cnpj: rowCnpj, name: row[nameIdx] || "", admin: adminIdx !== -1 ? row[adminIdx] || "" : "",
            tp_fundo_classe: tpIdx !== -1 ? row[tpIdx] || "" : "", condom: condIdx !== -1 ? row[condIdx] || "" : "",
          });
        }
      }
      if (seen.size >= limit) break;
    }

    // Fallback: Tab IV if few results
    if (seen.size < limit && seen.size < 5) {
      for (const [filename, file] of Object.entries(zip.files)) {
        if (file.dir || !filename.endsWith(".csv") || !filename.toLowerCase().includes("tab_iv")) continue;
        const text = await file.async("text");
        const lines = text.split("\n").filter((l) => l.trim());
        if (lines.length < 2) continue;
        const header = lines[0].split(";").map((h) => h.trim().replace(/"/g, ""));
        let cnpjIdx = header.indexOf("CNPJ_FUNDO_CLASSE");
        if (cnpjIdx === -1) cnpjIdx = header.indexOf("CNPJ_FUNDO");
        const nameIdx = header.indexOf("DENOM_SOCIAL") !== -1 ? header.indexOf("DENOM_SOCIAL") : header.indexOf("NM_FUNDO_CLASSE");
        const adminIdx = header.indexOf("ADMIN");
        const tpIdx = header.indexOf("TP_FUNDO_CLASSE") !== -1 ? header.indexOf("TP_FUNDO_CLASSE") : header.indexOf("TP_FUNDO");
        const condIdx = header.indexOf("CONDOM");
        if (cnpjIdx === -1) continue;

        for (let i = 1; i < lines.length; i++) {
          if (seen.size >= limit) break;
          const row = lines[i].split(";").map((c) => c.trim().replace(/"/g, ""));
          const rowCnpj = cleanCnpj(row[cnpjIdx] || "");
          if (!rowCnpj || !/^\d{11,14}$/.test(rowCnpj) || seen.has(rowCnpj)) continue;
          const name = (row[nameIdx] || "").toUpperCase();
          const admin = adminIdx !== -1 ? (row[adminIdx] || "").toUpperCase() : "";
          let searchText = field === "NAME" ? name : field === "ADMIN" ? admin : name + " " + admin;
          if ((cnpjSearch.length > 0 && matchesCnpj(rowCnpj, cnpjSearch)) || (cnpjSearch.length === 0 && terms.length > 0 && matchesText(searchText, terms))) {
            seen.set(rowCnpj, {
              cnpj: rowCnpj, name: row[nameIdx] || "", admin: adminIdx !== -1 ? row[adminIdx] || "" : "",
              tp_fundo_classe: tpIdx !== -1 ? row[tpIdx] || "" : "", condom: condIdx !== -1 ? row[condIdx] || "" : "",
            });
          }
        }
      }
    }

    const matches = Array.from(seen.values());
    return res.json({ matches, total_matches: matches.length, limit });
  } catch (err: any) {
    console.error("discover error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
