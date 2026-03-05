import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Menu, X } from "lucide-react";

const Navbar = () => {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { path: "/", label: "DASHBOARD" },
    { path: "/compare", label: t("nav.compare").toUpperCase() },
    { path: "/statements", label: "DEMONSTRAÇÕES" },
    { path: "/admin", label: "ADMIN" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border px-4 md:px-[60px]">
        <div className="flex items-center justify-between h-14 max-w-[1400px] mx-auto">
          <Link to="/" className="flex items-center gap-2 font-display font-extrabold text-base tracking-tight text-foreground">
            <span className="text-primary text-lg">●</span>
            <span>FIDC<span className="text-primary">.</span>Intel</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <Link
                key={l.path}
                to={l.path}
                className={`relative py-4 text-[12px] tracking-[3px] uppercase font-mono font-semibold transition-colors ${isActive(l.path)
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {l.label}
                {isActive(l.path) && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[12px] font-mono tracking-wider">
              <button
                onClick={() => setLanguage("pt")}
                className={`transition-colors ${language === "pt" ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                PT
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={() => setLanguage("en")}
                className={`transition-colors ${language === "en" ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                EN
              </button>
            </div>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed top-[57px] left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border md:hidden">
          <div className="flex flex-col py-2">
            {links.map((l) => (
              <Link
                key={l.path}
                to={l.path}
                className={`block py-3 px-4 text-sm tracking-[2px] uppercase transition-colors ${isActive(l.path)
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-primary"
                  }`}
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
