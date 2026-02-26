import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import Navbar from "@/components/Navbar";
import MetricCard from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatNumber, MONTHS } from "@/lib/format";
import { useLanguage } from "@/contexts/LanguageContext";

interface CompanyData {
  net_assets: number;
  portfolio: number;
  overdue: number;
  delinquency: number;
  unit_value: number;
  fund_count: number;
  liabilities: number;
  fund_type: string;
  cash: number;
  shareholders: number;
}

interface FundDetail {
  company: string;
  fund_name: string;
  cnpj: string;
  period: string;
  net_assets: number;
  portfolio: number;
  liabilities: number;
  overdue: number;
  fund_type: string;
  cash: number;
  shareholders: number;
}

type CompareResponse = Record<string, CompanyData> & { details: FundDetail[] };

const COMPANIES = [
  { key: "multiplica", label: "Multiplica", color: "bg-primary", chartColor: "hsl(160, 100%, 45%)" },
  { key: "red", label: "Red", color: "bg-accent", chartColor: "hsl(20, 100%, 57%)" },
  { key: "atena", label: "Atena", color: "bg-secondary", chartColor: "hsl(221, 100%, 65%)" },
  { key: "cifra", label: "Cifra", color: "bg-yellow-500", chartColor: "hsl(45, 100%, 50%)" },
  { key: "omni", label: "Omni", color: "bg-purple-500", chartColor: "hsl(270, 100%, 60%)" },
  { key: "sifra", label: "Sifra", color: "bg-rose-500", chartColor: "hsl(350, 100%, 60%)" },
];

const Compare = () => {
  const { t } = useLanguage();
  const [year, setYear] = useState(2024);
  const [month, setMonth] = useState(5);
  const [fundType, setFundType] = useState<"STANDARD" | "NP">("STANDARD");

  const { data, isLoading, error } = useQuery({
    queryKey: ["compare", year, month + 1, fundType],
    queryFn: async () => {
      const refMonth = `${year}${String(month + 1).padStart(2, "0")}`;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/cvm-compare`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ refMonth, fundType }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        return (await res.json()) as CompareResponse;
      } finally {
        clearTimeout(timeout);
      }
    },
    retry: 1,
    staleTime: 1000 * 60 * 30,
  });

  const years = Array.from({ length: 17 }, (_, i) => 2010 + i);

  const chartData = data
    ? COMPANIES.map((c) => {
        const d = (data as Record<string, CompanyData>)[c.key];
        return d ? {
          name: c.label,
          assets: d.net_assets,
          delinquency: d.delinquency,
          unitVar: d.unit_value,
          receivables: d.portfolio,
          cash: d.cash,
          shareholders: d.shareholders,
        } : null;
      }).filter(Boolean)
    : [];

  const tableRows = data
    ? COMPANIES.map((c) => {
        const d = (data as Record<string, CompanyData>)[c.key];
        return d ? { name: c.label, color: c.color, ...d } : null;
      }).filter(Boolean) as ({ name: string; color: string } & CompanyData)[]
    : [];

  const tooltipStyle = {
    background: "hsl(228 20% 7%)",
    border: "1px solid hsl(230 20% 15%)",
    borderRadius: 4,
    color: "hsl(225 30% 93%)",
  };
  const labelStyle = { color: "hsl(225 30% 93%)" };
  const itemStyle = { color: "hsl(225 30% 93%)" };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 px-6 md:px-[60px] max-w-[1400px] mx-auto pb-20">
        {/* Header */}
        <div className="mb-10">
          <span className="inline-block border border-primary/30 text-primary text-xs tracking-[3px] uppercase px-3 py-1 rounded-sm mb-4 font-mono">
            {t("compare.badge")}
          </span>
          <h1 className="font-display font-extrabold text-3xl md:text-6xl tracking-tight leading-[0.95] mb-4">
            {t("compare.title")}
          </h1>
          <p className="font-serif font-light text-muted-foreground text-base md:text-lg max-w-xl leading-relaxed">
            {t("compare.subtitle")}
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 border border-border bg-card p-4 rounded-sm mb-8">
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-[2px] uppercase text-muted-foreground">{t("compare.year")}</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-muted text-foreground border border-border rounded-sm px-3 py-2.5 text-base md:text-sm font-mono"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-[2px] uppercase text-muted-foreground">{t("compare.month")}</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-muted text-foreground border border-border rounded-sm px-3 py-2.5 text-base md:text-sm font-mono"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex">
            <button
              onClick={() => setFundType("STANDARD")}
              className={`px-4 py-2.5 text-xs tracking-[2px] uppercase font-mono rounded-l-sm border transition-colors ${
                fundType === "STANDARD"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setFundType("NP")}
              className={`px-4 py-2.5 text-xs tracking-[2px] uppercase font-mono rounded-r-sm border-t border-b border-r transition-colors ${
                fundType === "NP"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              NP
            </button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground text-sm">{t("compare.loading")} {MONTHS[month]} {year}...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border border-accent/30 bg-accent/5 p-4 rounded-sm text-accent text-sm">
            {t("compare.error")} {(error as Error).message}
          </div>
        )}

        {data && (
          <>
            {/* Metric Cards — Row 1: Net Assets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {COMPANIES.map((c) => {
                const d = (data as Record<string, CompanyData>)[c.key];
                if (!d) return null;
                return (
                  <MetricCard
                    key={`${c.key}-pl`}
                    icon={<div className={`w-5 h-5 rounded-full ${c.color}`} />}
                    label={`${c.label} PL`}
                    value={formatCurrency(d.net_assets)}
                    subtitle={`${t("compare.metric.receivables")}: ${formatCurrency(d.portfolio)}`}
                    color="green"
                  />
                );
              })}
            </div>
            {/* Metric Cards — Row 2: Delinquency */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {COMPANIES.map((c) => {
                const d = (data as Record<string, CompanyData>)[c.key];
                if (!d) return null;
                return (
                  <MetricCard
                    key={`${c.key}-delinq`}
                    icon={<span className="text-xl">📊</span>}
                    label={`${c.label} ${t("compare.metric.delinq")}`}
                    value={formatPercent(d.delinquency)}
                    subtitle={t("compare.metric.overdue")}
                    color="orange"
                  />
                );
              })}
            </div>
            {/* Metric Cards — Row 3: Cash & Shareholders */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {COMPANIES.map((c) => {
                const d = (data as Record<string, CompanyData>)[c.key];
                if (!d) return null;
                return (
                  <MetricCard
                    key={`${c.key}-cash`}
                    icon={<span className="text-xl">💰</span>}
                    label={`${c.label} ${t("compare.metric.cash")}`}
                    value={formatCurrency(d.cash)}
                    subtitle={`${formatNumber(d.shareholders)} ${t("compare.metric.shareholders")}`}
                    color="blue"
                  />
                );
              })}
            </div>

            {/* Charts — 3x2 grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <ChartCard title={t("compare.chart.pl")}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                   <XAxis dataKey="name" tick={{ fill: "hsl(220 15% 58%)", fontSize: 13 }} />
                   <YAxis tick={{ fill: "hsl(220 15% 58%)", fontSize: 12 }} tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} formatter={(value: number) => [formatCurrency(value), "PL"]} />
                  <Bar dataKey="assets" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COMPANIES[index]?.chartColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title={t("compare.chart.delinq")}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                   <XAxis dataKey="name" tick={{ fill: "hsl(220 15% 58%)", fontSize: 13 }} />
                   <YAxis tick={{ fill: "hsl(220 15% 58%)", fontSize: 12 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} formatter={(value: number) => [formatPercent(value), "Inadimplência"]} />
                  <Bar dataKey="delinquency" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COMPANIES[index]?.chartColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title={t("compare.chart.unit")}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                   <XAxis dataKey="name" tick={{ fill: "hsl(220 15% 58%)", fontSize: 13 }} />
                   <YAxis tick={{ fill: "hsl(220 15% 58%)", fontSize: 12 }} tickFormatter={(v) => `${v.toFixed(2)}%`} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} formatter={(value: number) => [formatPercent(value), "Cota"]} />
                  <Bar dataKey="unitVar" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COMPANIES[index]?.chartColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title={t("compare.chart.receivables")}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                   <XAxis dataKey="name" tick={{ fill: "hsl(220 15% 58%)", fontSize: 13 }} />
                   <YAxis tick={{ fill: "hsl(220 15% 58%)", fontSize: 12 }} tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} formatter={(value: number) => [formatCurrency(value), "Recebíveis"]} />
                  <Bar dataKey="receivables" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COMPANIES[index]?.chartColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title={t("compare.chart.cash")}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                   <XAxis dataKey="name" tick={{ fill: "hsl(220 15% 58%)", fontSize: 13 }} />
                   <YAxis tick={{ fill: "hsl(220 15% 58%)", fontSize: 12 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} formatter={(value: number) => [formatCurrency(value), "Caixa"]} />
                  <Bar dataKey="cash" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COMPANIES[index]?.chartColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title={t("compare.chart.shareholders")}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                   <XAxis dataKey="name" tick={{ fill: "hsl(220 15% 58%)", fontSize: 13 }} />
                   <YAxis tick={{ fill: "hsl(220 15% 58%)", fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} formatter={(value: number) => [formatNumber(value), "Cotistas"]} />
                  <Bar dataKey="shareholders" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COMPANIES[index]?.chartColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </div>

            {/* Data Table */}
            <div className="border border-border rounded-sm overflow-x-auto mb-8">
              <table className="w-full text-sm md:text-base">
                <thead>
                  <tr className="bg-muted/40">
                    {[t("compare.col.company"), t("compare.col.pl"), t("compare.col.receivables"), t("compare.col.cash"), t("compare.col.shareholders"), t("compare.col.delinq"), t("compare.col.unitvar"), t("compare.col.subordination"), t("compare.col.type")].map((h) => (
                      <th key={h} className="text-left p-3 md:p-4 text-xs tracking-[2px] uppercase text-muted-foreground font-display whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.name} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="p-3 md:p-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${row.color}`} />
                          <span className="font-display font-semibold text-foreground">{row.name}</span>
                        </div>
                      </td>
                      <td className="p-3 md:p-4 text-foreground font-mono whitespace-nowrap">{formatCurrency(row.net_assets)}</td>
                      <td className="p-3 md:p-4 text-foreground font-mono whitespace-nowrap">{formatCurrency(row.portfolio)}</td>
                      <td className="p-3 md:p-4 text-foreground font-mono whitespace-nowrap">{formatCurrency(row.cash)}</td>
                      <td className="p-3 md:p-4 text-foreground font-mono">{formatNumber(row.shareholders)}</td>
                      <td className="p-4">
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs ${
                            row.delinquency < 5
                              ? "border-primary/40 text-primary bg-primary/10"
                              : "border-accent/40 text-accent bg-accent/10"
                          }`}
                        >
                          {formatPercent(row.delinquency)}
                        </Badge>
                      </td>
                      <td className="p-3 md:p-4 text-foreground font-mono">{formatPercent(row.unit_value)}</td>
                      <td className="p-3 md:p-4">
                        <span className="text-muted-foreground text-sm italic" title={t("compare.na")}>{t("compare.na")}</span>
                      </td>
                      <td className="p-3 md:p-4">
                        <Badge
                          variant="outline"
                          className={`text-[10px] tracking-wider uppercase ${
                            row.fund_type === "NP"
                              ? "border-secondary/40 text-secondary bg-secondary/10"
                              : "border-muted-foreground/30 text-muted-foreground bg-muted/30"
                          }`}
                        >
                          {row.fund_type || "STANDARD"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Fund Details */}
            {data.details && data.details.length > 0 && (
              <div>
                <h3 className="font-display text-xs tracking-[3px] uppercase text-muted-foreground mb-4">
                  {t("compare.fundDetails")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.details.map((d) => (
                    <div key={d.cnpj} className="border border-border bg-card rounded-sm p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-display font-semibold text-sm text-foreground leading-tight mb-1">
                            {d.fund_name}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            CNPJ: {d.cnpj} · {d.period}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs tracking-wider uppercase ${
                            d.fund_type === "NP"
                              ? "border-secondary/40 text-secondary"
                              : "border-muted-foreground/30 text-muted-foreground"
                          }`}
                        >
                          {d.fund_type}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <DetailMetric label={t("compare.detail.netAssets")} value={formatCurrency(d.net_assets)} variant="green" />
                        <DetailMetric label={t("compare.detail.receivables")} value={formatCurrency(d.portfolio)} variant="green" />
                        <DetailMetric label={t("compare.detail.cash")} value={formatCurrency(d.cash)} variant="green" />
                        <DetailMetric label={t("compare.detail.liabilities")} value={formatCurrency(d.liabilities)} variant="orange" />
                        <DetailMetric label={t("compare.detail.overdue")} value={formatCurrency(d.overdue)} variant="orange" />
                        <DetailMetric label={t("compare.detail.shareholders")} value={formatNumber(d.shareholders)} variant="blue" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-5 rounded-sm">
      <h3 className="font-display text-[11px] tracking-[2px] uppercase text-muted-foreground mb-5">
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function DetailMetric({ label, value, variant }: { label: string; value: string; variant: "green" | "orange" | "blue" }) {
  const colorMap = { green: "text-primary", orange: "text-accent", blue: "text-secondary" };
  return (
    <div>
      <p className="text-[11px] tracking-[1px] uppercase text-muted-foreground mb-1">{label}</p>
      <p className={`font-mono text-base font-semibold ${colorMap[variant]}`}>
        {value}
      </p>
    </div>
  );
}

export default Compare;
