import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Language = "pt" | "en";

type Translations = Record<string, Record<Language, string>>;

const translations: Translations = {
  // Navbar
  "nav.home": { pt: "Home", en: "Home" },
  "nav.compare": { pt: "Comparar", en: "Compare" },

  // Index page
  "index.tag": { pt: "// Blueprint v1.0 — Plataforma de Inteligência FIDC", en: "// Blueprint v1.0 — FIDC Intelligence Platform" },
  "index.h1.line1": { pt: "Espione", en: "Spy on" },
  "index.h1.line2": { pt: "seus ", en: "your " },
  "index.h1.competitors": { pt: "concorrentes", en: "competitors" },
  "index.h1.line3": { pt: "Sistematicamente", en: "Systematically" },
  "index.subtitle": {
    pt: "Uma plataforma full-stack completa para comparar fundos FIDC — ingerindo dados públicos da CVM, calculando métricas de inadimplência e rentabilidade, e exibindo-os de forma elegante.",
    en: "A complete full-stack platform to compare FIDC funds — ingesting CVM public data, computing delinquency & profitability metrics, and displaying them beautifully.",
  },
  "index.cta": { pt: "Abrir Comparação →", en: "Open Compare →" },
  "index.tag.cvm": { pt: "API CVM", en: "CVM API" },
  "index.tag.realtime": { pt: "Dados em Tempo Real", en: "Real-time Data" },

  // Compare page
  "compare.badge": { pt: "CVM Ao Vivo", en: "Live CVM" },
  "compare.title": { pt: "Comparação de FIDC", en: "FIDC Comparison" },
  "compare.subtitle": { pt: "Comparação de FIDC em tempo real usando dados oficiais da CVM.", en: "Real-time FIDC comparison using official CVM data." },
  "compare.year": { pt: "Ano", en: "Year" },
  "compare.month": { pt: "Mês", en: "Month" },
  "compare.loading": { pt: "Buscando dados da CVM para", en: "Fetching CVM data for" },
  "compare.error": { pt: "Falha ao carregar dados:", en: "Failed to load data:" },
  "compare.col.company": { pt: "Empresa", en: "Company" },
  "compare.col.pl": { pt: "PL", en: "PL" },
  "compare.col.receivables": { pt: "Recebíveis", en: "Receivables" },
  "compare.col.cash": { pt: "Caixa", en: "Cash" },
  "compare.col.shareholders": { pt: "Cotistas", en: "Shareholders" },
  "compare.col.delinq": { pt: "Inadimpl. %", en: "Delinq. %" },
  "compare.col.unitvar": { pt: "Var. Cota %", en: "Unit Var %" },
  "compare.col.subordination": { pt: "Subordinação", en: "Subordination" },
  "compare.col.type": { pt: "Tipo", en: "Type" },
  "compare.na": { pt: "N/D", en: "N/A" },
  "compare.fundDetails": { pt: "Detalhes dos Fundos — Dados CVM Brutos", en: "Fund Details — Raw CVM Data" },
  "compare.metric.pl": { pt: "PL", en: "PL" },
  "compare.metric.receivables": { pt: "Recebíveis", en: "Receivables" },
  "compare.metric.cash": { pt: "Caixa", en: "Cash" },
  "compare.metric.delinq": { pt: "Inadimpl.", en: "Delinq." },
  "compare.metric.overdue": { pt: "Atraso / Carteira", en: "Overdue / Portfolio" },
  "compare.metric.shareholders": { pt: "cotistas", en: "shareholders" },
  "compare.detail.netAssets": { pt: "Ativos Líquidos (PL)", en: "Net Assets (PL)" },
  "compare.detail.receivables": { pt: "Recebíveis", en: "Receivables" },
  "compare.detail.cash": { pt: "Caixa", en: "Cash" },
  "compare.detail.liabilities": { pt: "Passivos", en: "Liabilities" },
  "compare.detail.overdue": { pt: "Vencidos", en: "Overdue" },
  "compare.detail.shareholders": { pt: "Cotistas", en: "Shareholders" },
  "compare.chart.pl": { pt: "Patrimônio Líquido (R$)", en: "Net Assets (R$)" },
  "compare.chart.delinq": { pt: "Inadimplência (%)", en: "Delinquency (%)" },
  "compare.chart.unit": { pt: "Valor da Cota (%)", en: "Unit Value (%)" },
  "compare.chart.receivables": { pt: "Direitos Creditórios (R$)", en: "Receivables (R$)" },
  "compare.chart.cash": { pt: "Caixa / Disponibilidades (R$)", en: "Cash / Availabilities (R$)" },
  "compare.chart.shareholders": { pt: "Quantidade de Cotistas", en: "Number of Shareholders" },

  // Statements page
  "statements.title": { pt: "Demonstrações Financeiras", en: "Financial Statements" },
  "statements.compareCompanies": { pt: "Comparar Empresas", en: "Compare Companies" },
  "statements.comparePeriods": { pt: "Comparar Períodos", en: "Compare Periods" },
  "statements.companies": { pt: "Empresas:", en: "Companies:" },
  "statements.company": { pt: "Empresa:", en: "Company:" },
  "statements.period": { pt: "Período:", en: "Period:" },
  "statements.period1": { pt: "Período 1:", en: "Period 1:" },
  "statements.period2": { pt: "Período 2:", en: "Period 2:" },
  "statements.period3": { pt: "Período 3:", en: "Period 3:" },
  "statements.addPeriod": { pt: "+ Adicionar 3º período", en: "+ Add 3rd period" },
  "statements.removePeriod": { pt: "– Remover 3º período", en: "– Remove 3rd period" },
  "statements.errorLoading": { pt: "Erro ao carregar dados:", en: "Error loading data:" },
  "statements.noData": { pt: "Não há informações para a data selecionada.", en: "No data available for the selected date." },

  // StatementTreeGrid
  "grid.expandAll": { pt: "Expandir Tudo", en: "Expand All" },
  "grid.collapseAll": { pt: "Recolher Tudo", en: "Collapse All" },
  "grid.code": { pt: "Código", en: "Code" },
  "grid.description": { pt: "Descrição da Conta", en: "Account Description" },
  "grid.loading": { pt: "Carregando demonstrações...", en: "Loading statements..." },

  // Statements - Try Again
  "statements.tryAgain": { pt: "Tentar novamente", en: "Try again" },

  // NotFound
  "notfound.title": { pt: "Página não encontrada", en: "Oops! Page not found" },
  "notfound.back": { pt: "Voltar ao Início", en: "Return to Home" },

  // Months
  "month.jan": { pt: "Jan", en: "Jan" },
  "month.feb": { pt: "Fev", en: "Feb" },
  "month.mar": { pt: "Mar", en: "Mar" },
  "month.apr": { pt: "Abr", en: "Apr" },
  "month.may": { pt: "Mai", en: "May" },
  "month.jun": { pt: "Jun", en: "Jun" },
  "month.jul": { pt: "Jul", en: "Jul" },
  "month.aug": { pt: "Ago", en: "Aug" },
  "month.sep": { pt: "Set", en: "Sep" },
  "month.oct": { pt: "Out", en: "Oct" },
  "month.nov": { pt: "Nov", en: "Nov" },
  "month.dec": { pt: "Dez", en: "Dec" },

  // Cached data
  "cached.title": { pt: "Dados em cache", en: "Showing cached data" },
  "cached.description": { pt: "Os dados de {months} são de uma busca anterior. A fonte ao vivo estava temporariamente indisponível.", en: "Data for {months} is from a previous fetch. The live source was temporarily unavailable." },

  // No data
  "compare.noData": { pt: "Sem dados disponíveis para este período.", en: "No data available for this period." },

  // Chart subtitle
  "compare.chart.unit.subtitle": { pt: "Variação mensal", en: "Month-over-month change" },

  // PL note
  "compare.plNote": { pt: "PL calculado via dados agregados do Informe Mensal (cvm-compare). Pode diferir dos demonstrativos contábeis (cvm-statements).", en: "PL computed from aggregated Monthly Report data (cvm-compare). May differ from accounting statements (cvm-statements)." },

  // Nav
  "nav.statements": { pt: "Demonstrações", en: "Statements" },

  // Grid
  "grid.allTabs": { pt: "Todas as Tabs", en: "All Tabs" },
  "grid.clearSelection": { pt: "Limpar seleção", en: "Clear selection" },
  "grid.maxSelection": { pt: "Máximo de {max} contas selecionadas.", en: "Maximum of {max} accounts selected." },

  // Statements chart button
  "statements.viewChart": { pt: "Ver Gráfico", en: "View Chart" },

  // Regulation Chat
  "chat.regulations": { pt: "Regulamentos", en: "Regulations" },
  "chat.title": { pt: "Chat — Regulamentos FIDC", en: "Chat — FIDC Regulations" },
  "chat.empty": { pt: "Pergunte sobre os regulamentos dos fundos. Ex: \"Quais as taxas de administração?\"", en: "Ask about fund regulations. E.g. \"What are the management fees?\"" },
  "chat.placeholder": { pt: "Pergunte sobre regulamentos...", en: "Ask about regulations..." },

  // Admin Regulations
  "admin.regulations": { pt: "Regulamentos", en: "Regulations" },
  "admin.regulations.desc": { pt: "Gerencie os regulamentos ingeridos por concorrente.", en: "Manage ingested regulations per competitor." },
  "admin.regulations.upload": { pt: "Upload PDF", en: "Upload PDF" },
  "admin.regulations.ingestUrl": { pt: "Ingerir de URL", en: "Ingest from URL" },
  "admin.regulations.pasteText": { pt: "Colar Texto", en: "Paste Text" },
  "admin.regulations.chunks": { pt: "chunks", en: "chunks" },
  "admin.regulations.noDocuments": { pt: "Nenhum regulamento ingerido ainda.", en: "No regulations ingested yet." },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("fidc-lang");
    return (saved === "en" || saved === "pt") ? saved : "pt";
  });

  const handleSetLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("fidc-lang", lang);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[key]?.[language] ?? key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
