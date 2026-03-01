import { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
  "hsl(200, 98%, 39%)",  // primary blue
  "hsl(145, 100%, 42%)", // green
  "hsl(0, 72%, 50%)",    // red
  "hsl(38, 92%, 50%)",   // orange
  "hsl(280, 65%, 60%)",  // purple
  "hsl(180, 70%, 45%)",  // teal
  "hsl(330, 80%, 55%)",  // pink
  "hsl(55, 90%, 50%)",   // yellow
  "hsl(210, 70%, 60%)",  // light blue
  "hsl(15, 85%, 55%)",   // coral
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

  // Data for bar/line/area: one row per column, one key per account
  const chartData = useMemo(() => {
    return columns.map((col) => {
      const row: Record<string, unknown> = { name: col.label };
      for (const accId of accountIds) {
        row[accId] = getValue(col.key, accId);
      }
      return row;
    });
  }, [columns, accountIds, getValue]);

  // Data for pie: sum across columns for each account
  const pieData = useMemo(() => {
    return accountIds.map((accId, i) => {
      let total = 0;
      for (const col of columns) total += Math.abs(getValue(col.key, accId));
      return { name: labelMap.get(accId) || accId, value: total, fill: PALETTE[i % PALETTE.length] };
    });
  }, [accountIds, columns, getValue, labelMap]);

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

  const renderCartesian = () => {
    const ChartComp = chartType === "line" ? LineChart : chartType === "area" ? AreaChart : BarChart;
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
          {accountIds.map((accId, i) => {
            const color = PALETTE[i % PALETTE.length];
            if (chartType === "line") return <Line key={accId} type="monotone" dataKey={accId} stroke={color} strokeWidth={2} dot={{ r: 4 }} />;
            if (chartType === "area") return <Area key={accId} type="monotone" dataKey={accId} stroke={color} fill={color} fillOpacity={0.2} />;
            return <Bar key={accId} dataKey={accId} fill={color} radius={[4, 4, 0, 0]} />;
          })}
        </ChartComp>
      </ResponsiveContainer>
    );
  };

  const renderPie = () => (
    <ResponsiveContainer width="100%" height={400}>
      <PieChart>
        <Pie data={pieData} cx="50%" cy="50%" outerRadius={150} dataKey="value" label={({ name, percent }) => `${name.split(" - ").pop()} (${(percent * 100).toFixed(0)}%)`}>
          {pieData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `R$ ${brFmt.format(value)}`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );

  return (
    <div className="mt-8 rounded-lg border border-primary/30 bg-card p-6">
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
      {chartType === "pie" ? renderPie() : renderCartesian()}
    </div>
  );
};

export default ChartPanel;
