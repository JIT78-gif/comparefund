import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Globe, Menu, X } from "lucide-react";

const Navbar = () => {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const linkClass = (path: string) =>
    `text-[11px] tracking-[2px] uppercase transition-colors ${
      location.pathname === path
        ? "text-primary"
        : "text-muted-foreground hover:text-primary"
    }`;

  const mobileLinkClass = (path: string) =>
    `block py-3 px-4 text-sm tracking-[2px] uppercase transition-colors ${
      location.pathname === path
        ? "text-primary font-semibold"
        : "text-muted-foreground hover:text-primary"
    }`;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border px-4 md:px-[60px] py-4 flex items-center justify-between">
        <Link to="/" className="font-display font-extrabold text-sm tracking-tight text-foreground">
          FIDC<span className="text-primary">.</span>Intel
        </Link>
        <div className="flex items-center gap-4 md:gap-7">
          <div className="hidden md:flex items-center gap-7">
            <Link to="/" className={linkClass("/")}>{t("nav.dashboard")}</Link>
            <Link to="/compare" className={linkClass("/compare")}>{t("nav.compare")}</Link>
            <Link to="/statements" className={linkClass("/statements")}>{t("nav.statements")}</Link>
          </div>
          <button
            onClick={() => setLanguage(language === "pt" ? "en" : "pt")}
            className="flex items-center gap-1.5 text-[11px] tracking-[2px] uppercase text-muted-foreground hover:text-primary transition-colors border border-border rounded-sm px-2.5 py-1.5"
            title={language === "pt" ? "Switch to English" : "Mudar para Português"}
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="font-mono font-semibold">{language === "pt" ? "EN" : "PT"}</span>
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      {mobileOpen && (
        <div className="fixed top-[57px] left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border md:hidden">
          <div className="flex flex-col py-2">
            <Link to="/" className={mobileLinkClass("/")} onClick={() => setMobileOpen(false)}>{t("nav.dashboard")}</Link>
            <Link to="/compare" className={mobileLinkClass("/compare")} onClick={() => setMobileOpen(false)}>{t("nav.compare")}</Link>
            <Link to="/statements" className={mobileLinkClass("/statements")} onClick={() => setMobileOpen(false)}>{t("nav.statements")}</Link>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
