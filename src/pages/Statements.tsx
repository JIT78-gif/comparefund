import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import StatementTreeGrid from "@/components/StatementTreeGrid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const COMPANIES = [
  { key: "multiplica", label: "Multiplica" },
  { key: "red", label: "Red" },
  { key: "atena", label: "Atena" },
  { key: "cifra", label: "Cifra" },
];

const YEARS = Array.from({ length: 7 }, (_, i) => String(2019 + i));
const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

type CompareMode = "companies" | "periods";

const Statements = () => {
  const [mode, setMode] = useState<CompareMode>("companies");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(["multiplica", "red"]);
  const [singleCompany, setSingleCompany] = useState("multiplica");
  const [fundType, setFundType] = useState("STANDARD");

  // Period selectors
  const [year1, setYear1] = useState("2025");
  const [month1, setMonth1] = useState("01");
  const [year2, setYear2] = useState("2025");
  const [month2, setMonth2] = useState("02");
  const [year3, setYear3] = useState("2025");
  const [month3, setMonth3] = useState("03");
  const [usePeriod3, setUsePeriod3] = useState(false);

  const months = useMemo(() => {
    if (mode === "companies") {
      return [`${year1}${month1}`];
    }
    const m = [`${year1}${month1}`, `${year2}${month2}`];
    if (usePeriod3) m.push(`${year3}${month3}`);
    return m;
  }, [mode, year1, month1, year2, month2, year3, month3, usePeriod3]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cvm-statements", months, fundType],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("cvm-statements", {
        body: { months, fundType },
      });
      if (error) throw error;
      return data as Record<string, Record<string, Record<string, Record<string, number | string>>>>;
    },
  });

  const toggleCompany = (key: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  };

  // Build columns & getValue based on mode
  const columns = useMemo(() => {
    if (mode === "companies") {
      return selectedCompanies.map((key) => ({
        key,
        label: COMPANIES.find((c) => c.key === key)?.label || key,
      }));
    }
    return months.map((m) => ({
      key: m,
      label: `${MONTH_LABELS[parseInt(m.slice(4)) - 1]}/${m.slice(0, 4)}`,
    }));
  }, [mode, selectedCompanies, months]);

  const getValue = useCallback(
    (colKey: string, accountId: string): number => {
      if (!data) return 0;
      if (mode === "companies") {
        const month = months[0];
        const companyData = data[month]?.[colKey];
        if (!companyData) return 0;
        // Sum across all CNPJs for the company
        let total = 0;
        for (const cnpjData of Object.values(companyData)) {
          total += (typeof cnpjData[accountId] === "number" ? cnpjData[accountId] : 0) as number;
        }
        return total;
      }
      // Period mode: colKey is the month
      const companyData = data[colKey]?.[singleCompany];
      if (!companyData) return 0;
      let total = 0;
      for (const cnpjData of Object.values(companyData)) {
        total += (typeof cnpjData[accountId] === "number" ? cnpjData[accountId] : 0) as number;
      }
      return total;
    },
    [data, mode, months, singleCompany]
  );

  const MonthYearPicker = ({
    year, setYear, month, setMonth, label,
  }: {
    year: string; setYear: (v: string) => void;
    month: string; setMonth: (v: string) => void;
    label: string;
  }) => (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="w-[80px] h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_LABELS.map((ml, i) => (
            <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{ml}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={year} onValueChange={setYear}>
        <SelectTrigger className="w-[90px] h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {YEARS.map((y) => (
            <SelectItem key={y} value={y}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 px-4 md:px-[60px] pb-12 max-w-[1400px] mx-auto">
        <h1 className="font-display font-extrabold text-2xl md:text-3xl text-foreground mb-6">
          Demonstrações Financeiras
        </h1>

        {/* Controls */}
        <div className="space-y-4 mb-6">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "companies" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("companies")}
              className="text-sm"
            >
              Comparar Empresas
            </Button>
            <Button
              variant={mode === "periods" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("periods")}
              className="text-sm"
            >
              Comparar Períodos
            </Button>
            <div className="ml-auto flex gap-1">
              <Button
                variant={fundType === "STANDARD" ? "default" : "outline"}
                size="sm"
                onClick={() => setFundType("STANDARD")}
                className="text-xs"
              >
                Standard
              </Button>
              <Button
                variant={fundType === "NP" ? "default" : "outline"}
                size="sm"
                onClick={() => setFundType("NP")}
                className="text-xs"
              >
                NP
              </Button>
            </div>
          </div>

          {/* Company selection */}
          {mode === "companies" ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-muted-foreground font-semibold">Empresas:</span>
              {COMPANIES.map((c) => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedCompanies.includes(c.key)}
                    onCheckedChange={() => toggleCompany(c.key)}
                  />
                  <span className="text-sm text-foreground">{c.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground font-semibold">Empresa:</span>
              <Select value={singleCompany} onValueChange={setSingleCompany}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Period selection */}
          <div className="flex flex-wrap items-center gap-4">
            <MonthYearPicker label={mode === "companies" ? "Período:" : "Período 1:"} year={year1} setYear={setYear1} month={month1} setMonth={setMonth1} />
            {mode === "periods" && (
              <>
                <MonthYearPicker label="Período 2:" year={year2} setYear={setYear2} month={month2} setMonth={setMonth2} />
                {usePeriod3 ? (
                  <MonthYearPicker label="Período 3:" year={year3} setYear={setYear3} month={month3} setMonth={setMonth3} />
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUsePeriod3(!usePeriod3)}
                  className="text-xs text-muted-foreground"
                >
                  {usePeriod3 ? "– Remover 3º período" : "+ Adicionar 3º período"}
                </Button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 mb-6 text-destructive text-sm">
            Erro ao carregar dados: {(error as Error).message}
          </div>
        )}

        <StatementTreeGrid columns={columns} getValue={getValue} loading={isLoading} />
      </main>
    </div>
  );
};

export default Statements;
