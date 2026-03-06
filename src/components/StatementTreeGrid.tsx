import { useState, useMemo } from "react";
import { ChevronsUpDown, ChevronsDownUp, Filter, X } from "lucide-react";
import { ACCOUNT_TREE, TAB_LABELS, flattenTree, getDescendantIds, getLeafIds, isRateColumn, isQuantityColumn, type FlatAccount } from "@/lib/account-tree";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";

interface ColumnDef {
  key: string;
  label: string;
}

interface StatementTreeGridProps {
  columns: ColumnDef[];
  getValue: (colKey: string, accountId: string) => number;
  loading?: boolean;
  selectedAccounts: Set<string>;
  onToggleAccount: (id: string) => void;
  onClearSelection: () => void;
}

const brFmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatValue(value: number, accountId: string): string {
  if (value === 0) return "—";
  if (isRateColumn(accountId)) return `${value.toFixed(2)}%`;
  if (isQuantityColumn(accountId)) return brFmt.format(value);
  const formatted = brFmt.format(Math.abs(value));
  return value < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`;
}

const MAX_SELECTION = 10;

const StatementTreeGrid = ({ columns, getValue, loading, selectedAccounts, onToggleAccount, onClearSelection }: StatementTreeGridProps) => {
  const { t } = useLanguage();
  const [tabFilter, setTabFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const filteredTree = useMemo(() => {
    if (tabFilter === "all") return ACCOUNT_TREE;
    return ACCOUNT_TREE.filter((node) => node.code === tabFilter);
  }, [tabFilter]);

  const flatAccounts = useMemo(() => flattenTree(filteredTree), [filteredTree]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        const descendants = getDescendantIds(filteredTree, id);
        for (const d of descendants) next.delete(d);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allParents = flatAccounts.filter((a) => a.hasChildren).map((a) => a.id);
    setExpanded(new Set(allParents));
  };

  const collapseAll = () => setExpanded(new Set());

  const visibleRows = useMemo(() => {
    const visible: FlatAccount[] = [];
    const hiddenParents = new Set<string>();

    for (const account of flatAccounts) {
      if (account.depth === 0) {
        visible.push(account);
      } else if (account.parentId && expanded.has(account.parentId) && !hiddenParents.has(account.parentId)) {
        visible.push(account);
      } else {
        hiddenParents.add(account.id);
      }
    }
    return visible;
  }, [flatAccounts, expanded]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-muted-foreground text-base">{t("grid.loading")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={expandAll} className="text-xs gap-1.5">
          <ChevronsUpDown className="h-3.5 w-3.5" /> {t("grid.expandAll")}
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs gap-1.5">
          <ChevronsDownUp className="h-3.5 w-3.5" /> {t("grid.collapseAll")}
        </Button>
        {selectedAccounts.size > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="text-xs gap-1.5 text-destructive">
            <X className="h-3.5 w-3.5" /> Limpar seleção
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{selectedAccounts.size}</Badge>
          </Button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={tabFilter} onValueChange={setTabFilter}>
            <SelectTrigger className="w-[260px] h-8 text-xs">
              <SelectValue placeholder="Todas as Tabs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Tabs</SelectItem>
              {TAB_LABELS.map((tab) => (
                <SelectItem key={tab.code} value={tab.code}>{tab.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative w-full overflow-auto rounded-lg border border-[hsl(var(--table-accent)_/_0.4)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-grid-header border-b-2 border-b-[hsl(var(--table-accent)_/_0.4)]">
              <th className="sticky left-0 z-20 bg-grid-header text-left py-3 px-4 font-display font-semibold text-foreground min-w-[120px] border-r border-border/50">
                {t("grid.code")}
              </th>
              <th className="sticky left-[120px] z-20 bg-grid-header text-left py-3 px-4 font-display font-semibold text-foreground min-w-[280px] border-r border-border/50">
                {t("grid.description")}
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-right py-3 px-4 font-display font-semibold text-foreground min-w-[160px] border-r border-border/50 last:border-r-0"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((account) => {
              const isParent = account.hasChildren;
              const isExpanded = expanded.has(account.id);
              const isTopLevel = account.depth === 0;

              const rowBg = isTopLevel
                ? "bg-grid-row-top"
                : isParent
                ? "bg-grid-row-parent"
                : "hover:bg-accent/30";

              const stickyBg = isTopLevel
                ? "bg-grid-row-top"
                : isParent
                ? "bg-grid-row-parent"
                : "bg-background";

              return (
                <tr
                  key={account.id}
                  className={`border-b border-border/30 transition-colors ${rowBg}`}
                >
                  <td className={`sticky left-0 z-10 ${stickyBg} py-2.5 px-4 font-mono text-muted-foreground text-sm border-r border-border/30`}>
                    {!isTopLevel && account.code}
                  </td>

                  <td className={`sticky left-[120px] z-10 ${stickyBg} py-2.5 px-4 border-r border-border/30`}>
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${Math.max(0, account.depth - 1) * 20}px` }}
                    >
                      {!isTopLevel && !account.id.startsWith("_") && (
                        <Checkbox
                          checked={selectedAccounts.has(account.id)}
                          onCheckedChange={() => {
                            if (!selectedAccounts.has(account.id) && selectedAccounts.size >= MAX_SELECTION) {
                              toast({ title: "Limite atingido", description: `Máximo de ${MAX_SELECTION} contas selecionadas.`, variant: "destructive" });
                              return;
                            }
                            onToggleAccount(account.id);
                          }}
                          className="h-3.5 w-3.5 shrink-0"
                        />
                      )}
                      {isParent && (
                        <button
                          onClick={() => toggleExpand(account.id)}
                          className="text-[hsl(var(--table-accent))] hover:text-[hsl(var(--table-accent)_/_0.7)] transition-colors text-sm leading-none"
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                      )}
                      <span
                        className={`${
                          isTopLevel
                            ? "font-display font-bold text-foreground text-[15px]"
                            : isParent
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isTopLevel
                          ? `${account.code} - ${account.label.toUpperCase()}`
                          : `${account.code} - ${account.label}`}
                      </span>
                    </div>
                  </td>

                  {columns.map((col) => {
                    const isVirtual = account.id.startsWith("_");
                    let value: number;
                    if (isVirtual) {
                      const leafIds = getLeafIds(filteredTree, account.id);
                      const childValues = leafIds.map(id => getValue(col.key, id));
                      const nonZero = childValues.filter(v => v !== 0);
                      if (isRateColumn(leafIds[0] || "")) {
                        value = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
                      } else {
                        value = childValues.reduce((a, b) => a + b, 0);
                      }
                    } else {
                      value = getValue(col.key, account.id);
                    }
                    const isNegative = value < 0;
                    const isZero = value === 0;
                    return (
                      <td
                        key={col.key}
                        className={`py-2.5 px-4 text-right font-mono tabular-nums text-sm border-r border-border/30 last:border-r-0 ${
                          isNegative
                            ? "text-destructive"
                            : isZero
                            ? "text-muted-foreground/40"
                            : isTopLevel
                            ? "text-foreground font-bold"
                            : isParent
                            ? "text-foreground font-semibold"
                            : "text-foreground"
                        }`}
                      >
                        {formatValue(value, account.id)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StatementTreeGrid;
