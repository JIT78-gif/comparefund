import { useState, useMemo } from "react";
import { ChevronsUpDown, ChevronsDownUp } from "lucide-react";
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

const brFmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatBRL(value: number): string {
  if (value === 0) return "—";
  const formatted = brFmt.format(Math.abs(value));
  return value < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`;
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
              <th className="text-left py-3 px-3 font-display font-semibold text-foreground min-w-[80px] sticky left-0 bg-muted/50 z-10 border-t-2 border-t-primary">
                {t("grid.code")}
              </th>
              <th className="text-left py-3 px-3 font-display font-semibold text-foreground min-w-[220px] border-t-2 border-t-primary">
                {t("grid.description")}
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-right py-3 px-4 font-display font-semibold text-foreground min-w-[160px] border-t-2 border-t-primary"
                >
                  {col.label} <span className="text-muted-foreground font-normal text-xs">(R$)</span>
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
                      ? "bg-primary/10 hover:bg-primary/15"
                      : isParent
                      ? "bg-primary/5 hover:bg-primary/10"
                      : "hover:bg-muted/20"
                  }`}
                >
                  {/* Código */}
                  <td
                    className={`py-2.5 px-3 sticky left-0 z-10 font-mono text-muted-foreground ${
                      isTopLevel ? "bg-primary/10" : isParent ? "bg-primary/5" : "bg-background"
                    }`}
                  >
                    <div
                      className="flex items-center gap-1"
                      style={{ paddingLeft: `${account.depth * 12}px` }}
                    >
                      {isParent ? (
                        <button
                          onClick={() => toggleExpand(account.id)}
                          className="text-primary hover:text-primary/80 transition-colors text-xs leading-none mr-0.5"
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                      ) : (
                        <span className="w-3" />
                      )}
                      <span className="text-xs">{account.code}</span>
                    </div>
                  </td>

                  {/* Descrição */}
                  <td className="py-2.5 px-3">
                    <span
                      className={`${
                        isParent ? "font-semibold text-foreground" : "text-muted-foreground"
                      } ${isTopLevel ? "font-display text-sm" : "text-sm"}`}
                    >
                      {account.label}
                    </span>
                  </td>

                  {/* Values */}
                  {columns.map((col) => {
                    const value = getValue(col.key, account.id);
                    const isNegative = value < 0;
                    const isZero = value === 0;
                    return (
                      <td
                        key={col.key}
                        className={`py-2.5 px-4 text-right font-mono tabular-nums text-sm ${
                          isNegative
                            ? "text-destructive"
                            : isZero
                            ? "text-muted-foreground/50"
                            : isParent
                            ? "text-foreground font-semibold"
                            : "text-foreground"
                        }`}
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
