import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import StatementTreeGrid from "@/components/StatementTreeGrid";
import ChartPanel from "@/components/ChartPanel";
import FundSelector, { type FundHierarchy } from "@/components/FundSelector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlertTriangle, RefreshCw, Info, BarChart3 } from "lucide-react";
import { invokeStatements, classifyError } from "@/lib/cvm-invoke";
import { fetchCompetitors, type Competitor } from "@/lib/competitors";

const YEARS = Array.from({ length: 15 }, (_, i) => String(2013 + i));

const MONTH_KEYS = [
  "month.jan", "month.feb", "month.mar", "month.apr", "month.may", "month.jun",
  "month.jul", "month.aug", "month.sep", "month.oct", "month.nov", "month.dec",
];

type CompareMode = "companies" | "periods";

const MonthYearPicker = ({
  year, setYear, month, setMonth, label, monthLabels,
}: {
  year: string; setYear: (v: string) => void;
  month: string; setMonth: (v: string) => void;
  label: string;
  monthLabels: string[];
}) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    <Select value={month} onValueChange={setMonth}>
      <SelectTrigger className="w-[80px] h-9 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {monthLabels.map((ml, i) => (
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

/** Extract fund hierarchy from response data: company -> cnpj -> { fund_name, fund_type } */
function extractFundHierarchy(
  data: Record<string, Record<string, Record<string, Record<string, number | string>>>> | null
): FundHierarchy {
  if (!data) return {};
  const hierarchy: FundHierarchy = {};
  for (const monthData of Object.values(data)) {
    for (const [company, companyData] of Object.entries(monthData)) {
      if (!hierarchy[company]) hierarchy[company] = {};
      for (const [cnpj, cnpjData] of Object.entries(companyData)) {
        if (!hierarchy[company][cnpj]) {
          hierarchy[company][cnpj] = {
            fund_name: typeof cnpjData.fund_name === "string" ? cnpjData.fund_name : cnpj,
            fund_type: typeof cnpjData.fund_type === "string" ? cnpjData.fund_type : "STANDARD",
          };
        }
      }
    }
  }
  return hierarchy;
}

const Statements = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  // Dynamic competitors from DB
  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: fetchCompetitors,
    staleTime: 5 * 60 * 1000,
  });

  const COMPANIES = useMemo(() =>
    competitors
      .filter((c) => c.status === "active")
      .map((c) => ({ key: c.slug, label: c.name })),
    [competitors]
  );

  const [mode, setMode] = useState<CompareMode>("companies");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [singleCompany, setSingleCompany] = useState("");

  // Sync selectedCompanies with available COMPANIES list
  useEffect(() => {
    if (COMPANIES.length === 0) return;
    const validKeys = new Set(COMPANIES.map((c) => c.key));
    setSelectedCompanies((prev) => {
      const filtered = prev.filter((k) => validKeys.has(k));
      // If nothing selected yet (initial load), select all
      return filtered.length > 0 ? filtered : COMPANIES.map((c) => c.key);
    });
    setSingleCompany((prev) => validKeys.has(prev) ? prev : COMPANIES[0]?.key || "");
  }, [COMPANIES]);
  const [fundType, setFundType] = useState("STANDARD");
  const [selectedCnpjs, setSelectedCnpjs] = useState<Set<string>>(new Set());

  const [year1, setYear1] = useState("2024");
  const [month1, setMonth1] = useState("11");
  const [year2, setYear2] = useState("2024");
  const [month2, setMonth2] = useState("10");
  const [year3, setYear3] = useState("2024");
  const [month3, setMonth3] = useState("09");
  const [usePeriod3, setUsePeriod3] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const chartRef = useRef<HTMLDivElement>(null);
  const monthLabels = MONTH_KEYS.map((k) => t(k));

  const lastGoodData = useRef<Record<string, Record<string, Record<string, Record<string, number | string>>>> | null>(null);
  const [staleMonths, setStaleMonths] = useState<string[]>([]);

  const [debouncedKey, setDebouncedKey] = useState<{ months: string[]; fundType: string }>({ months: ["202411"], fundType: "STANDARD" });

  const months = useMemo(() => {
    if (mode === "companies") return [`${year1}${month1}`];
    const m = [`${year1}${month1}`, `${year2}${month2}`];
    if (usePeriod3) m.push(`${year3}${month3}`);
    return m;
  }, [mode, year1, month1, year2, month2, year3, month3, usePeriod3]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKey({ months, fundType });
    }, 400);
    return () => clearTimeout(timer);
  }, [months, fundType]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["cvm-statements", debouncedKey.months, debouncedKey.fundType],
    queryFn: async () => {
      setStaleMonths([]);
      const result = await invokeStatements(debouncedKey.months, debouncedKey.fundType, 65_000);
      if (result?._meta) {
        const stale = Object.entries(result._meta as Record<string, string>)
          .filter(([, v]) => v === "stale")
          .map(([k]) => k);
        setStaleMonths(stale);
      }
      const { _meta, _errors, ...cleaned } = result as Record<string, unknown>;
      lastGoodData.current = cleaned as Record<string, Record<string, Record<string, Record<string, number | string>>>>;
      return lastGoodData.current;
    },
    retry: 0,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const displayData = data ?? lastGoodData.current;

  // Extract fund hierarchy from loaded data
  const fundHierarchy = useMemo(() => {
    const full = extractFundHierarchy(displayData);
    if (mode === "periods") {
      return singleCompany && full[singleCompany]
        ? { [singleCompany]: full[singleCompany] }
        : {};
    }
    const filtered: FundHierarchy = {};
    for (const key of selectedCompanies) {
      if (full[key]) filtered[key] = full[key];
    }
    return filtered;
  }, [displayData, mode, singleCompany, selectedCompanies]);

  // Reset CNPJ selection when data changes (select all by default)
  useEffect(() => {
    setSelectedCnpjs(new Set());
  }, [displayData, singleCompany, mode]);

  const handleRetry = () => {
    queryClient.invalidateQueries({ queryKey: ["cvm-statements", debouncedKey.months, debouncedKey.fundType] });
  };

  const toggleCompany = (key: string) => {
    setSelectedCompanies((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  };

  const columns = useMemo(() => {
    if (mode === "companies") {
      return selectedCompanies.map((key) => ({
        key,
        label: COMPANIES.find((c) => c.key === key)?.label || key,
      }));
    }
    return debouncedKey.months.map((m) => ({
      key: m,
      label: `${monthLabels[parseInt(m.slice(4)) - 1]}/${m.slice(0, 4)}`,
    }));
  }, [mode, selectedCompanies, debouncedKey.months, monthLabels]);

  const getValue = useCallback(
    (colKey: string, accountId: string): number => {
      if (!displayData) return 0;
      const isRate = accountId.startsWith("TAB_IX_") || accountId === "TAB_X_PR_GARANTIA_DIRCRED";
      const aggregate = (companyData: Record<string, Record<string, number | string>>) => {
        let sum = 0, count = 0;
        for (const [cnpj, cnpjData] of Object.entries(companyData)) {
          // Filter by selected CNPJs (empty set = all selected)
          if (selectedCnpjs.size > 0 && !selectedCnpjs.has(cnpj)) continue;
          const v = typeof cnpjData[accountId] === "number" ? cnpjData[accountId] as number : 0;
          if (isRate) { if (v !== 0) { sum += v; count++; } }
          else { sum += v; }
        }
        return isRate && count > 0 ? sum / count : sum;
      };
      if (mode === "companies") {
        const companyData = displayData[debouncedKey.months[0]]?.[colKey];
        return companyData ? aggregate(companyData) : 0;
      }
      const companyData = displayData[colKey]?.[singleCompany];
      return companyData ? aggregate(companyData) : 0;
    },
    [displayData, mode, debouncedKey.months, singleCompany, selectedCnpjs]
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 px-3 sm:px-4 md:px-[60px] pb-12 max-w-[1400px] mx-auto">
        <h1 className="font-bold text-2xl sm:text-3xl text-foreground mb-8">
          {t("statements.title")}
        </h1>

        {/* Tabs row: mode tabs + Standard/NP toggle */}
        <div className="flex items-center justify-between border-b border-border mb-6">
          <div className="flex gap-8">
            <button
              onClick={() => setMode("companies")}
              className={`relative pb-3 text-sm font-semibold tracking-tight transition-colors ${
                mode === "companies" ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("statements.compareCompanies")}
              {mode === "companies" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              )}
            </button>
            <button
              onClick={() => setMode("periods")}
              className={`relative pb-3 text-sm font-semibold tracking-tight transition-colors ${
                mode === "periods" ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("statements.comparePeriods")}
              {mode === "periods" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 pb-3">
            <span className={`text-xs font-mono font-semibold ${fundType === "STANDARD" ? "text-primary" : "text-muted-foreground"}`}>
              Standard
            </span>
            <Switch
              checked={fundType === "NP"}
              onCheckedChange={(checked) => setFundType(checked ? "NP" : "STANDARD")}
            />
            <span className={`text-xs font-mono ${fundType === "NP" ? "text-primary" : "text-muted-foreground"}`}>
              NP
            </span>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4 mb-6">
          {mode === "companies" ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm text-muted-foreground font-semibold">{t("statements.companies")}</span>
                {COMPANIES.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={selectedCompanies.includes(c.key)} onCheckedChange={() => toggleCompany(c.key)} />
                    <span className={`text-sm ${selectedCompanies.includes(c.key) ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {c.label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <FundSelector
                  hierarchy={fundHierarchy}
                  selectedCnpjs={selectedCnpjs}
                  onSelectionChange={setSelectedCnpjs}
                />
                <MonthYearPicker label={t("statements.period")} year={year1} setYear={setYear1} month={month1} setMonth={setMonth1} monthLabels={monthLabels} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground font-semibold">{t("statements.company")}</span>
                <Select value={singleCompany} onValueChange={setSingleCompany}>
                  <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPANIES.map((c) => (<SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <FundSelector
                  hierarchy={fundHierarchy}
                  selectedCnpjs={selectedCnpjs}
                  onSelectionChange={setSelectedCnpjs}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <MonthYearPicker label={t("statements.period1")} year={year1} setYear={setYear1} month={month1} setMonth={setMonth1} monthLabels={monthLabels} />
                <MonthYearPicker label={t("statements.period2")} year={year2} setYear={setYear2} month={month2} setMonth={setMonth2} monthLabels={monthLabels} />
                {usePeriod3 && (
                  <MonthYearPicker label={t("statements.period3")} year={year3} setYear={setYear3} month={month3} setMonth={setMonth3} monthLabels={monthLabels} />
                )}
                <Button variant="ghost" size="sm" onClick={() => setUsePeriod3(!usePeriod3)} className="text-xs text-muted-foreground">
                  {usePeriod3 ? t("statements.removePeriod") : t("statements.addPeriod")}
                </Button>
              </div>
            </>
          )}
        </div>

        {staleMonths.length > 0 && !error && (
          <Alert className="mb-4 border-accent bg-muted">
            <Info className="h-4 w-4 text-muted-foreground" />
            <AlertTitle className="text-foreground">{t("cached.title")}</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {t("cached.description").replace("{months}", staleMonths.join(", "))}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("statements.errorLoading")}</AlertTitle>
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span>{classifyError(error).message}</span>
              <Button variant="outline" size="sm" onClick={handleRetry} disabled={isFetching} className="w-fit">
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                {t("statements.tryAgain")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && displayData && (() => {
          const hasAnyData = columns.some((col) => {
            if (mode === "companies") {
              const companyData = displayData[debouncedKey.months[0]]?.[col.key];
              return companyData && Object.keys(companyData).length > 0;
            }
            const companyData = displayData[col.key]?.[singleCompany];
            return companyData && Object.keys(companyData).length > 0;
          });
          return !hasAnyData;
        })() && (
          <div className="border border-border bg-card p-8 rounded-sm text-center text-muted-foreground text-sm mb-8">
            {t("statements.noData")}
          </div>
        )}

        <StatementTreeGrid
          columns={columns}
          getValue={getValue}
          loading={isLoading}
          selectedAccounts={selectedAccounts}
          onToggleAccount={(id) => setSelectedAccounts((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })}
          onClearSelection={() => setSelectedAccounts(new Set())}
        />

        {selectedAccounts.size > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              onClick={() => chartRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="gap-2 shadow-lg"
            >
              <BarChart3 className="h-4 w-4" /> {t("statements.viewChart")} ({selectedAccounts.size})
            </Button>
          </div>
        )}

        <div ref={chartRef}>
          <ChartPanel selectedAccounts={selectedAccounts} columns={columns} getValue={getValue} />
        </div>
      </main>
    </div>
  );
};

export default Statements;
