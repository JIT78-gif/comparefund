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

function findCol(header: string[], candidates: string[]): number {
  for (const name of candidates) {
    const idx = header.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

interface FundResult { cnpj: string; name: string; admin: string; gestor: string; cnpj_gestor: string; tp_fundo: string; sit: string; }

function parseCsvForFunds(text: string, terms: string[], cnpjSearch: string[], limit: number): FundResult[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().replace(/"/g, "").toUpperCase());

  const cnpjIdx = findCol(header, ["CNPJ_FUNDO_CLASSE", "CNPJ_FUNDO", "CNPJ"]);
  const nameIdx = findCol(header, ["DENOM_SOCIAL", "NM_FUNDO_CLASSE", "NOME_FUNDO"]);
  const gestorIdx = findCol(header, ["GESTOR", "NM_GESTOR"]);
  const cnpjGestorIdx = findCol(header, ["CNPJ_GESTOR", "CPF_CNPJ_GESTOR"]);
  const adminIdx = findCol(header, ["ADMIN", "NM_ADMIN", "ADMINISTRADOR"]);
  const tpIdx = findCol(header, ["TP_FUNDO_CLASSE", "TP_FUNDO", "CLASSE"]);
  const sitIdx = findCol(header, ["SIT", "SITUACAO", "CD_SIT"]);

  if (cnpjIdx === -1) return [];
  const searchColIdx = gestorIdx !== -1 ? gestorIdx : adminIdx;
  if (searchColIdx === -1) return [];

  const results: FundResult[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    if (results.length >= limit) break;
    const row = lines[i].split(sep).map((c) => c.trim().replace(/"/g, ""));
    const rowCnpj = cleanCnpj(row[cnpjIdx] || "");
    if (!rowCnpj || !/^\d{11,14}$/.test(rowCnpj)) continue;
    if (tpIdx !== -1) {
      const tp = (row[tpIdx] || "").toUpperCase();
      if (!tp.includes("FIDC") && !tp.includes("FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS")) continue;
    }
    const gestorName = searchColIdx !== -1 ? (row[searchColIdx] || "").toUpperCase() : "";
    const gestorCnpj = cnpjGestorIdx !== -1 ? cleanCnpj(row[cnpjGestorIdx] || "") : "";
    const textMatched = terms.length > 0 && matchesText(gestorName, terms);
    const cnpjMatched = cnpjSearch.length > 0 && cnpjSearch.some((c) => gestorCnpj === c || gestorCnpj.startsWith(c) || c.startsWith(gestorCnpj));
    if (textMatched || cnpjMatched) {
      if (seen.has(rowCnpj)) continue;
      seen.add(rowCnpj);
      results.push({
        cnpj: rowCnpj, name: row[nameIdx] || "",
        admin: adminIdx !== -1 ? row[adminIdx] || "" : "",
        gestor: gestorIdx !== -1 ? row[gestorIdx] || "" : (adminIdx !== -1 ? row[adminIdx] || "" : ""),
        cnpj_gestor: gestorCnpj,
        tp_fundo: tpIdx !== -1 ? row[tpIdx] || "" : "",
        sit: sitIdx !== -1 ? row[sitIdx] || "" : "",
      });
    }
  }
  return results;
}

/** POST /api/manager-search */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { searchTerms, searchCnpjs, limit: rawLimit } = req.body;
    const terms: string[] = (searchTerms || []).filter((t: string) => t.trim());
    const cnpjSearch: string[] = (searchCnpjs || []).map((c: string) => cleanCnpj(c));
    const limit = Math.min(Math.max(rawLimit || 200, 1), 1000);

    if (terms.length === 0 && cnpjSearch.length === 0) {
      return res.status(400).json({ error: "Provide searchTerms or searchCnpjs" });
    }

    const urls = [
      "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip",
      "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv",
    ];

    let funds: FundResult[] = [];

    const zipRes = await fetch(urls[0]);
    if (zipRes.ok) {
      const zip = await JSZip.loadAsync(await zipRes.arrayBuffer());
      for (const [filename, file] of Object.entries(zip.files)) {
        if (file.dir || !filename.endsWith(".csv")) continue;
        const csvText = await file.async("text");
        funds = parseCsvForFunds(csvText, terms, cnpjSearch, limit);
        break;
      }
    }

    if (funds.length === 0) {
      const csvRes = await fetch(urls[1]);
      if (csvRes.ok) {
        funds = parseCsvForFunds(await csvRes.text(), terms, cnpjSearch, limit);
      }
    }

    const managerMap = new Map<string, { name: string; cnpj: string; funds: FundResult[] }>();
    for (const fund of funds) {
      const key = fund.cnpj_gestor || fund.gestor;
      if (!managerMap.has(key)) managerMap.set(key, { name: fund.gestor, cnpj: fund.cnpj_gestor, funds: [] });
      managerMap.get(key)!.funds.push(fund);
    }

    return res.json({ managers: Array.from(managerMap.values()), total_funds: funds.length });
  } catch (err: any) {
    console.error("manager-search error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
