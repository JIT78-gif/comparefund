import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp } from "lucide-react";
import { ACCOUNT_TREE, flattenTree, getDescendantIds, type FlatAccount } from "@/lib/account-tree";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface ColumnDef {
  key: string;
  label: string;
}

interface StatementTreeGridProps {
  columns: ColumnDef[];
  getValue: (colKey: string, accountId: string) => number;
  loading?: boolean;
}

function formatBRL(value: number): string {
  if (value === 0) return "—";
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000_000) {
    formatted = `${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (abs >= 1_000_000) {
    formatted = `${(value / 1_000_000).toFixed(2)}M`;
  } else if (abs >= 1_000) {
    formatted = `${(value / 1_000).toFixed(1)}K`;
  } else {
    formatted = value.toFixed(2);
  }
  return `R$ ${formatted}`;
}

const StatementTreeGrid = ({ columns, getValue, loading }: StatementTreeGridProps) => {
  const { t } = useLanguage();
  const flatAccounts = useMemo(() => flattenTree(ACCOUNT_TREE), []);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        const descendants = getDescendantIds(ACCOUNT_TREE, id);
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
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={expandAll} className="text-xs gap-1.5">
          <ChevronsUpDown className="h-3.5 w-3.5" /> {t("grid.expandAll")}
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs gap-1.5">
          <ChevronsDownUp className="h-3.5 w-3.5" /> {t("grid.collapseAll")}
        </Button>
      </div>

      <div className="relative w-full overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left py-3 px-4 font-display font-semibold text-foreground min-w-[280px] sticky left-0 bg-muted/50 z-10">
                {t("grid.account")}
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-right py-3 px-4 font-display font-semibold text-foreground min-w-[160px]"
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

              return (
                <tr
                  key={account.id}
                  className={`border-b border-border/50 transition-colors ${
                    isTopLevel
                      ? "bg-muted/30 hover:bg-muted/50"
                      : "hover:bg-muted/20"
                  }`}
                >
                  <td
                    className={`py-2.5 px-4 sticky left-0 z-10 ${
                      isTopLevel ? "bg-muted/30" : "bg-background"
                    }`}
                  >
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${account.depth * 20}px` }}
                    >
                      {isParent ? (
                        <button
                          onClick={() => toggleExpand(account.id)}
                          className="p-0.5 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5" />
                      )}
                      <span
                        className={`${
                          isParent ? "font-semibold text-foreground" : "text-muted-foreground"
                        } ${isTopLevel ? "font-display text-base" : "text-sm"}`}
                      >
                        {account.label}
                      </span>
                    </div>
                  </td>
                  {columns.map((col) => {
                    const value = getValue(col.key, account.id);
                    const isNegative = value < 0;
                    const isZero = value === 0;
                    return (
                      <td
                        key={col.key}
                        className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                          isNegative
                            ? "text-destructive"
                            : isZero
                            ? "text-muted-foreground/50"
                            : isParent
                            ? "text-foreground font-semibold"
                            : "text-foreground"
                        } ${isTopLevel ? "text-base" : "text-sm"}`}
                      >
                        {formatBRL(value)}
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
