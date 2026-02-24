import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import StatementTreeGrid from "@/components/StatementTreeGrid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlertTriangle, RefreshCw, Info, WifiOff } from "lucide-react";
import { invokeStatements, classifyError } from "@/lib/cvm-invoke";

const COMPANIES = [
  { key: "multiplica", label: "Multiplica" },
  { key: "red", label: "Red" },
  { key: "atena", label: "Atena" },
  { key: "cifra", label: "Cifra" },
];

const YEARS = Array.from({ length: 7 }, (_, i) => String(2019 + i));

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

const Statements = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CompareMode>("companies");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(["multiplica", "red"]);
  const [singleCompany, setSingleCompany] = useState("multiplica");
  const [fundType, setFundType] = useState("STANDARD");

  const [year1, setYear1] = useState("2024");
  const [month1, setMonth1] = useState("11");
  const [year2, setYear2] = useState("2024");
  const [month2, setMonth2] = useState("10");
  const [year3, setYear3] = useState("2024");
  const [month3, setMonth3] = useState("09");
  const [usePeriod3, setUsePeriod3] = useState(false);

  const monthLabels = MONTH_KEYS.map((k) => t(k));

  const lastGoodData = useRef<Record<string, Record<string, Record<string, Record<string, number | string>>>> | null>(null);
  const [staleMonths, setStaleMonths] = useState<string[]>([]);

  // Debounced query key
  const [debouncedKey, setDebouncedKey] = useState<{ months: string[]; fundType: string }>({ months: ["202411"], fundType: "STANDARD" });

  const months = useMemo(() => {
    if (mode === "companies") return [`${year1}${month1}`];
    const m = [`${year1}${month1}`, `${year2}${month2}`];
    if (usePeriod3) m.push(`${year3}${month3}`);
    return m;
  }, [mode, year1, month1, year2, month2, year3, month3, usePeriod3]);

  // Debounce: update query key 400ms after last change
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

      // Check _meta for stale entries
      if (result?._meta) {
        const stale = Object.entries(result._meta as Record<string, string>)
          .filter(([, v]) => v === "stale")
          .map(([k]) => k);
        setStaleMonths(stale);
      }

      // Remove internal keys before storing
      const { _meta, _errors, ...cleaned } = result as Record<string, unknown>;

      lastGoodData.current = cleaned as Record<string, Record<string, Record<string, Record<string, number | string>>>>;
      return lastGoodData.current;
    },
    retry: 0, // retries handled inside invokeStatements
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const displayData = data ?? lastGoodData.current;

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
      if (mode === "companies") {
        const month = debouncedKey.months[0];
        const companyData = displayData[month]?.[colKey];
        if (!companyData) return 0;
        let total = 0;
        for (const cnpjData of Object.values(companyData)) {
          total += (typeof cnpjData[accountId] === "number" ? cnpjData[accountId] : 0) as number;
        }
        return total;
      }
      const companyData = displayData[colKey]?.[singleCompany];
      if (!companyData) return 0;
      let total = 0;
      for (const cnpjData of Object.values(companyData)) {
        total += (typeof cnpjData[accountId] === "number" ? cnpjData[accountId] : 0) as number;
      }
      return total;
    },
    [displayData, mode, debouncedKey.months, singleCompany]
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 px-3 sm:px-4 md:px-[60px] pb-12 max-w-[1400px] mx-auto">
        <h1 className="font-display font-extrabold text-xl sm:text-2xl md:text-3xl text-foreground mb-4 sm:mb-6">
          {t("statements.title")}
        </h1>

        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "companies" ? "default" : "outline"} size="sm" onClick={() => setMode("companies")} className="text-xs sm:text-sm">
              {t("statements.compareCompanies")}
            </Button>
            <Button variant={mode === "periods" ? "default" : "outline"} size="sm" onClick={() => setMode("periods")} className="text-xs sm:text-sm">
              {t("statements.comparePeriods")}
            </Button>
            <div className="flex gap-1 ml-auto">
              <Button variant={fundType === "STANDARD" ? "default" : "outline"} size="sm" onClick={() => setFundType("STANDARD")} className="text-xs">
                Standard
              </Button>
              <Button variant={fundType === "NP" ? "default" : "outline"} size="sm" onClick={() => setFundType("NP")} className="text-xs">
                NP
              </Button>
            </div>
          </div>

          {mode === "companies" ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-muted-foreground font-semibold">{t("statements.companies")}</span>
              {COMPANIES.map((c) => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={selectedCompanies.includes(c.key)} onCheckedChange={() => toggleCompany(c.key)} />
                  <span className="text-sm text-foreground">{c.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground font-semibold">{t("statements.company")}</span>
              <Select value={singleCompany} onValueChange={setSingleCompany}>
                <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPANIES.map((c) => (<SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 sm:gap-4">
            <MonthYearPicker label={mode === "companies" ? t("statements.period") : t("statements.period1")} year={year1} setYear={setYear1} month={month1} setMonth={setMonth1} monthLabels={monthLabels} />
            {mode === "periods" && (
              <>
                <MonthYearPicker label={t("statements.period2")} year={year2} setYear={setYear2} month={month2} setMonth={setMonth2} monthLabels={monthLabels} />
                {usePeriod3 && (
                  <MonthYearPicker label={t("statements.period3")} year={year3} setYear={setYear3} month={month3} setMonth={setMonth3} monthLabels={monthLabels} />
                )}
                <Button variant="ghost" size="sm" onClick={() => setUsePeriod3(!usePeriod3)} className="text-xs text-muted-foreground">
                  {usePeriod3 ? t("statements.removePeriod") : t("statements.addPeriod")}
                </Button>
              </>
            )}
          </div>
        </div>

        {staleMonths.length > 0 && !error && (
          <Alert className="mb-4 border-accent bg-muted">
            <Info className="h-4 w-4 text-muted-foreground" />
            <AlertTitle className="text-foreground">Showing cached data</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Data for {staleMonths.join(", ")} is from a previous fetch. The live source was temporarily unavailable.
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
                {t("statements.tryAgain") || "Try again"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <StatementTreeGrid columns={columns} getValue={getValue} loading={isLoading} />
      </main>
    </div>
  );
};

export default Statements;
