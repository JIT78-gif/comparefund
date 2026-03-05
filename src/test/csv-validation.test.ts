import { describe, it, expect } from "vitest";

// ── cleanCnpj ──────────────────────────────────────────────────

function cleanCnpj(raw: string): string {
  return raw.replace(/[.\-\/]/g, "");
}

describe("cleanCnpj", () => {
  it("removes dots, dashes, and slashes", () => {
    expect(cleanCnpj("14.166.140/0001-49")).toBe("14166140000149");
  });

  it("returns already-clean CNPJ unchanged", () => {
    expect(cleanCnpj("14166140000149")).toBe("14166140000149");
  });

  it("handles empty string", () => {
    expect(cleanCnpj("")).toBe("");
  });
});

// ── parseNum ───────────────────────────────────────────────────

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

describe("parseNum", () => {
  it("returns 0 for undefined", () => {
    expect(parseNum(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseNum("")).toBe(0);
  });

  it("parses simple number", () => {
    expect(parseNum("1234.56")).toBe(1234.56);
  });

  it("parses comma as decimal separator", () => {
    expect(parseNum("1234,56")).toBe(1234.56);
  });

  it("handles quoted values", () => {
    expect(parseNum('"1234.56"')).toBe(1234.56);
  });

  it("handles negative with parentheses", () => {
    expect(parseNum("(500.00)")).toBe(-500);
  });

  it("handles thousands separators (dots)", () => {
    expect(parseNum("1.234.567,89")).toBe(1234567.89);
  });

  it("returns 0 for non-numeric", () => {
    expect(parseNum("abc")).toBe(0);
  });

  it("handles whitespace", () => {
    expect(parseNum("  1234.56  ")).toBe(1234.56);
  });
});

// ── isValidCnpj ────────────────────────────────────────────────

function isValidCnpj(cnpj: string): boolean {
  return /^\d{14}$/.test(cnpj);
}

describe("isValidCnpj", () => {
  it("accepts 14-digit CNPJ", () => {
    expect(isValidCnpj("14166140000149")).toBe(true);
  });

  it("rejects too short", () => {
    expect(isValidCnpj("1416614")).toBe(false);
  });

  it("rejects formatted CNPJ", () => {
    expect(isValidCnpj("14.166.140/0001-49")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isValidCnpj("")).toBe(false);
  });
});

// ── Multi-word matching ────────────────────────────────────────

function matchesText(searchText: string, terms: string[]): boolean {
  for (const term of terms) {
    const words = term.toUpperCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (words.every((w) => searchText.includes(w))) return true;
  }
  return false;
}

describe("matchesText", () => {
  it("matches single word", () => {
    expect(matchesText("FIDC ATENA SECURITIZADORA", ["ATENA"])).toBe(true);
  });

  it("matches multi-word (all words present)", () => {
    expect(matchesText("FIDC ATENA SECURITIZADORA DE RECEBIVEIS", ["ATENA SECURITIZADORA"])).toBe(true);
  });

  it("does not match if one word missing", () => {
    expect(matchesText("FIDC ATENA DE RECEBIVEIS", ["ATENA SECURITIZADORA"])).toBe(false);
  });

  it("matches any of multiple terms", () => {
    expect(matchesText("FIDC CIFRA INVESTIMENTOS", ["ATENA", "CIFRA"])).toBe(true);
  });

  it("returns false for empty terms", () => {
    expect(matchesText("FIDC ATENA", [])).toBe(false);
  });
});
