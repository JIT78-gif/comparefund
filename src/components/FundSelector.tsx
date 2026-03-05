import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FundHierarchy {
  [company: string]: {
    [cnpj: string]: {
      fund_name: string;
      fund_type: string;
    };
  };
}

interface FundSelectorProps {
  hierarchy: FundHierarchy;
  selectedCnpjs: Set<string>;
  onSelectionChange: (cnpjs: Set<string>) => void;
}

const formatCnpj = (cnpj: string) => {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
};

const FundSelector = ({ hierarchy, selectedCnpjs, onSelectionChange }: FundSelectorProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(Object.keys(hierarchy)));

  const allCnpjs = useMemo(() => {
    const all = new Set<string>();
    for (const companyData of Object.values(hierarchy)) {
      for (const cnpj of Object.keys(companyData)) {
        all.add(cnpj);
      }
    }
    return all;
  }, [hierarchy]);

  const totalCount = allCnpjs.size;
  const selectedCount = selectedCnpjs.size === 0 ? totalCount : selectedCnpjs.size;
  const allSelected = selectedCnpjs.size === 0 || selectedCnpjs.size === totalCount;

  const toggleExpand = (company: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(company) ? next.delete(company) : next.add(company);
      return next;
    });
  };

  const toggleCnpj = (cnpj: string) => {
    const next = new Set(selectedCnpjs.size === 0 ? allCnpjs : selectedCnpjs);
    next.has(cnpj) ? next.delete(cnpj) : next.add(cnpj);
    // If all are selected again, reset to empty (meaning "all")
    if (next.size === totalCount) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(next);
    }
  };

  const toggleCompany = (company: string) => {
    const companyCnpjs = Object.keys(hierarchy[company] || {});
    const currentSelected = selectedCnpjs.size === 0 ? allCnpjs : selectedCnpjs;
    const allCompanySelected = companyCnpjs.every((c) => currentSelected.has(c));

    const next = new Set(currentSelected);
    if (allCompanySelected) {
      companyCnpjs.forEach((c) => next.delete(c));
    } else {
      companyCnpjs.forEach((c) => next.add(c));
    }
    if (next.size === totalCount) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(next);
    }
  };

  const selectAll = () => onSelectionChange(new Set());
  const deselectAll = () => onSelectionChange(new Set(["__none__"]));

  const isCnpjSelected = (cnpj: string) => selectedCnpjs.size === 0 || selectedCnpjs.has(cnpj);

  const isCompanyAllSelected = (company: string) => {
    const companyCnpjs = Object.keys(hierarchy[company] || {});
    return companyCnpjs.every((c) => isCnpjSelected(c));
  };

  const isCompanyPartial = (company: string) => {
    const companyCnpjs = Object.keys(hierarchy[company] || {});
    const some = companyCnpjs.some((c) => isCnpjSelected(c));
    const all = companyCnpjs.every((c) => isCnpjSelected(c));
    return some && !all;
  };

  if (totalCount <= 1) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <Filter className="h-3 w-3" />
          Fundos ({selectedCount}/{totalCount})
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-foreground">Filtrar por Fundo / CNPJ</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={selectAll}>
              Todos
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={deselectAll}>
              Nenhum
            </Button>
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2 space-y-1">
          {Object.entries(hierarchy).map(([company, cnpjs]) => {
            const isExpanded = expanded.has(company);
            const cnpjEntries = Object.entries(cnpjs);

            return (
              <div key={company}>
                <div
                  className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleExpand(company)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <Checkbox
                    checked={isCompanyAllSelected(company)}
                    className={cn(isCompanyPartial(company) && "opacity-60")}
                    onCheckedChange={(e) => {
                      e.valueOf(); // prevent propagation weirdness
                      toggleCompany(company);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-sm font-semibold text-foreground capitalize">{company}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {cnpjEntries.filter(([c]) => isCnpjSelected(c)).length}/{cnpjEntries.length}
                  </span>
                </div>
                {isExpanded && (
                  <div className="ml-6 space-y-0.5">
                    {cnpjEntries.map(([cnpj, info]) => (
                      <label
                        key={cnpj}
                        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={isCnpjSelected(cnpj)}
                          onCheckedChange={() => toggleCnpj(cnpj)}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-foreground truncate">{info.fund_name || "Sem nome"}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{formatCnpj(cnpj)}</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-auto shrink-0">
                          {info.fund_type}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default FundSelector;
