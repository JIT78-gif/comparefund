import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Navbar from "@/components/Navbar";
import MetricCard from "@/components/MetricCard";
import { formatCurrency, formatPercent, MONTHS } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

const Compare = () => {
  const [year, setYear] = useState(2024);
  const [month, setMonth] = useState(5); // June (0-indexed)
  const [fundType, setFundType] = useState<"STANDARD" | "NP">("STANDARD");

  const { data, isLoading, error } = useQuery({
    queryKey: ["compare", year, month + 1],
    queryFn: async () => {
      const refMonth = `${year}${String(month + 1).padStart(2, "0")}`;
      const { data, error } = await supabase.functions.invoke("cvm-compare", {
        body: { refMonth },
      });
      if (error) throw error;
      return data as {
        multiplica: { net_assets: number; portfolio: number; overdue: number; delinquency: number; unit_value: number };
        red: { net_assets: number; portfolio: number; overdue: number; delinquency: number; unit_value: number };
      };
    },
    retry: 1,
    staleTime: 1000 * 60 * 30,
  });

  const years = Array.from({ length: 17 }, (_, i) => 2010 + i);

  const chartData = data
    ? [
        {
          name: "Multiplica",
          assets: data.multiplica.net_assets,
          delinquency: data.multiplica.delinquency,
        },
        {
          name: "Red",
          assets: data.red.net_assets,
          delinquency: data.red.delinquency,
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 px-6 md:px-[60px] max-w-[1200px] mx-auto pb-20">
        {/* Header */}
        <div className="mb-10">
          <span className="inline-block border border-primary/30 text-primary text-[10px] tracking-[3px] uppercase px-3 py-1 rounded-sm mb-4 font-mono">
            Live CVM
          </span>
          <h1 className="font-display font-extrabold text-4xl md:text-6xl tracking-tight leading-[0.95] mb-4">
            Multiplica vs Red
          </h1>
          <p className="font-serif font-light text-muted-foreground text-lg max-w-xl leading-relaxed">
            Real-time FIDC comparison using official CVM data from dados.cvm.gov.br.
            Select any month from 2019 to present.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 border border-border bg-card p-4 rounded-sm mb-8">
          <div className="flex items-center gap-2">
            <span className="text-[11px] tracking-[2px] uppercase text-muted-foreground">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-muted text-foreground border border-border rounded-sm px-3 py-2 text-sm font-mono"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tracking-[2px] uppercase text-muted-foreground">Month</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-muted text-foreground border border-border rounded-sm px-3 py-2 text-sm font-mono"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex">
            <button
              onClick={() => setFundType("STANDARD")}
              className={`px-4 py-2 text-[11px] tracking-[2px] uppercase font-mono rounded-l-sm border transition-colors ${
                fundType === "STANDARD"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setFundType("NP")}
              className={`px-4 py-2 text-[11px] tracking-[2px] uppercase font-mono rounded-r-sm border-t border-b border-r transition-colors ${
                fundType === "NP"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              NP
            </button>
          </div>
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-muted-foreground text-sm">Fetching CVM data for {MONTHS[month]} {year}...</p>
          </div>
        )}

        {error && (
          <div className="border border-accent/30 bg-accent/5 p-4 rounded-sm text-accent text-sm">
            Failed to load data: {(error as Error).message}. Data may not be available for this period.
          </div>
        )}

        {/* Metric Cards */}
        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <MetricCard
                icon={<div className="w-6 h-6 rounded-full bg-primary glow-green" />}
                label="Multiplica PL"
                value={formatCurrency(data.multiplica.net_assets)}
                subtitle={`Portfolio: ${formatCurrency(data.multiplica.portfolio)}`}
                color="green"
              />
              <MetricCard
                icon={<div className="w-6 h-6 rounded-full bg-accent glow-orange" />}
                label="Red PL"
                value={formatCurrency(data.red.net_assets)}
                subtitle={`Portfolio: ${formatCurrency(data.red.portfolio)}`}
                color="orange"
              />
              <MetricCard
                icon={<span className="text-2xl">📊</span>}
                label="Multiplica Delinq."
                value={formatPercent(data.multiplica.delinquency)}
                subtitle="Overdue / Portfolio"
                color="blue"
              />
              <MetricCard
                icon={<span className="text-2xl">📊</span>}
                label="Red Delinq."
                value={formatPercent(data.red.delinquency)}
                subtitle="Overdue / Portfolio"
                color="orange"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="border border-border bg-card p-6 rounded-sm">
                <h3 className="font-display text-[11px] tracking-[2px] uppercase text-muted-foreground mb-6">
                  Total Assets (R$)
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                    <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} />
                    <Tooltip
                      contentStyle={{ background: "#111318", border: "1px solid #1e2130", borderRadius: 4 }}
                      labelStyle={{ color: "#e8eaf0" }}
                      formatter={(value: number) => [formatCurrency(value), "Assets"]}
                    />
                    <Bar dataKey="assets" fill="hsl(160, 100%, 45%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border border-border bg-card p-6 rounded-sm">
                <h3 className="font-display text-[11px] tracking-[2px] uppercase text-muted-foreground mb-6">
                  Delinquency Rate (%)
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 20% 15%)" />
                    <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                    <Tooltip
                      contentStyle={{ background: "#111318", border: "1px solid #1e2130", borderRadius: 4 }}
                      labelStyle={{ color: "#e8eaf0" }}
                      formatter={(value: number) => [formatPercent(value), "Delinquency"]}
                    />
                    <Bar dataKey="delinquency" fill="hsl(20, 100%, 57%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Data Table */}
            <div className="border border-border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-tag">
                    <th className="text-left p-4 text-[10px] tracking-[2px] uppercase text-muted-foreground font-display">Company</th>
                    <th className="text-right p-4 text-[10px] tracking-[2px] uppercase text-muted-foreground font-display">Net Assets</th>
                    <th className="text-right p-4 text-[10px] tracking-[2px] uppercase text-muted-foreground font-display">Portfolio</th>
                    <th className="text-right p-4 text-[10px] tracking-[2px] uppercase text-muted-foreground font-display">Overdue</th>
                    <th className="text-right p-4 text-[10px] tracking-[2px] uppercase text-muted-foreground font-display">Delinquency %</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Multiplica", ...data.multiplica },
                    { name: "Red", ...data.red },
                  ].map((row) => (
                    <tr key={row.name} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="p-4 text-foreground font-display font-semibold">{row.name}</td>
                      <td className="p-4 text-right text-muted-foreground">{formatCurrency(row.net_assets)}</td>
                      <td className="p-4 text-right text-muted-foreground">{formatCurrency(row.portfolio)}</td>
                      <td className="p-4 text-right text-muted-foreground">{formatCurrency(row.overdue)}</td>
                      <td className={`p-4 text-right font-mono ${row.delinquency > 5 ? "text-accent" : "text-primary"}`}>
                        {formatPercent(row.delinquency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Compare;
