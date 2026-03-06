import { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label,
} from "recharts";
import { ACCOUNT_TREE, flattenTree, isRateColumn, isQuantityColumn } from "@/lib/account-tree";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BarChart3, LineChart as LineChartIcon, AreaChart as AreaChartIcon, PieChart as PieChartIcon } from "lucide-react";

interface ColumnDef {
  key: string;
  label: string;
}

interface ChartPanelProps {
  selectedAccounts: Set<string>;
  columns: ColumnDef[];
  getValue: (colKey: string, accountId: string) => number;
}

const PALETTE = [
  "hsl(var(--chart-1))",      // cyan — primary brand
  "hsl(var(--chart-2))",      // light blue
  "hsl(var(--chart-3))",      // slate
  "hsl(var(--chart-4))",      // mid-grey
  "hsl(var(--chart-5))",      // dark-grey
  "hsl(152, 70%, 50%)",       // green — readable on dark bg
  "hsl(280, 60%, 65%)",       // purple
  "hsl(38, 85%, 55%)",        // amber
  "hsl(350, 70%, 60%)",       // rose
  "hsl(195, 80%, 55%)",       // sky
];

const brFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function formatTick(value: number, accountId?: string): string {
  if (accountId && isRateColumn(accountId)) return `${value.toFixed(2)}%`;
  if (accountId && isQuantityColumn(accountId)) return brFmt.format(value);
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}K`;
  return `R$ ${brFmt.format(value)}`;
}

function formatTooltipValue(value: number, accountId: string): string {
  if (isRateColumn(accountId)) return `${value.toFixed(2)}%`;
  if (isQuantityColumn(accountId)) return brFmt.format(value);
  const formatted = brFmt.format(Math.abs(value));
  return value < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`;
}

type ChartType = "bar" | "line" | "area" | "pie";

const ChartPanel = ({ selectedAccounts, columns, getValue }: ChartPanelProps) => {
  const [chartType, setChartType] = useState<ChartType>("bar");

  const allFlat = useMemo(() => flattenTree(ACCOUNT_TREE), []);
  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of allFlat) m.set(a.id, `${a.code} - ${a.label}`);
    return m;
  }, [allFlat]);

  const accountIds = useMemo(() => Array.from(selectedAccounts), [selectedAccounts]);

  // Unified data: X-axis = columns (periods/companies), one series per account
  const chartData = useMemo(() => {
    return columns.map((col) => {
      const row: Record<string, unknown> = { name: col.label };
      for (const accId of accountIds) {
        row[accId] = getValue(col.key, accId);
      }
      return row;
    });
  }, [columns, accountIds, getValue]);

  // Pie data: sum absolute values across columns per account, filter zeros
  const pieData = useMemo(() => {
    return accountIds
      .map((accId, i) => {
        let total = 0;
        for (const col of columns) total += Math.abs(getValue(col.key, accId));
        return {
          name: labelMap.get(accId) || accId,
          accountId: accId,
          value: total,
          fill: PALETTE[i % PALETTE.length],
        };
      })
      .filter((d) => d.value > 0);
  }, [accountIds, columns, getValue, labelMap]);

  const pieTotal = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

  if (selectedAccounts.size === 0) return null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-display font-semibold text-foreground mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="text-muted-foreground" style={{ color: entry.color }}>
            {labelMap.get(entry.dataKey) || entry.dataKey}: {formatTooltipValue(entry.value, entry.dataKey)}
          </p>
        ))}
      </div>
    );
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const entry = payload[0];
    const pct = pieTotal > 0 ? ((entry.value / pieTotal) * 100).toFixed(1) : "0";
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-display font-semibold text-foreground mb-1">{entry.name}</p>
        <p className="text-muted-foreground" style={{ color: entry.payload.fill }}>
          {formatTooltipValue(entry.value, entry.payload.accountId)} ({pct}%)
        </p>
      </div>
    );
  };

  const showFewDataWarning = (chartType === "line" || chartType === "area") && columns.length < 2;

  const renderCartesian = () => {
    const ChartComp = chartType === "line" ? LineChart : chartType === "area" ? AreaChart : BarChart;
    const showLabels = accountIds.length <= 3 && columns.length <= 6;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <ChartComp data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatTick(v)} width={80} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => (
              <span className="text-xs text-foreground">{labelMap.get(value) || value}</span>
            )}
          />
          {accountIds.map((key, i) => {
            const color = PALETTE[i % PALETTE.length];
            if (chartType === "line")
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                  label={showLabels ? { fontSize: 10, position: "top", formatter: (v: number) => formatTick(v, key) } : false}
                />
              );
            if (chartType === "area")
              return (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                  connectNulls
                  activeDot={{ r: 6 }}
                />
              );
            return <Bar key={key} dataKey={key} fill={color} radius={[4, 4, 0, 0]} />;
          })}
        </ChartComp>
      </ResponsiveContainer>
    );
  };

  const renderPie = () => {
    if (pieData.length === 0) {
      return (
        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
          Nenhum dado disponível para o gráfico de pizza.
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            outerRadius={150}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) => `${name.split(" - ").pop()} (${(percent * 100).toFixed(0)}%)`}
          >
            {pieData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="mt-8 rounded-sm border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-lg text-foreground">
          Gráfico ({selectedAccounts.size} {selectedAccounts.size === 1 ? "conta" : "contas"})
        </h2>
        <ToggleGroup type="single" value={chartType} onValueChange={(v) => v && setChartType(v as ChartType)}>
          <ToggleGroupItem value="bar" aria-label="Bar chart" className="gap-1 text-xs">
            <BarChart3 className="h-4 w-4" /> Barras
          </ToggleGroupItem>
          <ToggleGroupItem value="line" aria-label="Line chart" className="gap-1 text-xs">
            <LineChartIcon className="h-4 w-4" /> Linha
          </ToggleGroupItem>
          <ToggleGroupItem value="area" aria-label="Area chart" className="gap-1 text-xs">
            <AreaChartIcon className="h-4 w-4" /> Área
          </ToggleGroupItem>
          <ToggleGroupItem value="pie" aria-label="Pie chart" className="gap-1 text-xs">
            <PieChartIcon className="h-4 w-4" /> Pizza
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {showFewDataWarning && (
        <p className="text-xs text-muted-foreground mb-4">
          ⚠ Apenas {columns.length} coluna(s) — adicione mais períodos ou empresas para melhor visualização em linha/área.
        </p>
      )}
      {chartType === "pie" ? renderPie() : renderCartesian()}
    </div>
  );
};

export default ChartPanel;
