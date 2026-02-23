import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

const Index = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Navbar />

      {/* Radial glows */}
      <div className="absolute -top-[200px] -right-[200px] w-[700px] h-[700px] gradient-radial-green pointer-events-none" />
      <div className="absolute bottom-[-100px] left-[30%] w-[500px] h-[500px] gradient-radial-blue pointer-events-none" />

      <div className="relative z-10 min-h-screen flex flex-col justify-center px-6 md:px-[60px] max-w-[1200px] mx-auto">
        <p className="font-mono text-[11px] tracking-[4px] uppercase text-primary mb-6 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          {t("index.tag")}
        </p>

        <h1 className="font-display font-extrabold text-[clamp(42px,7vw,96px)] leading-[0.95] tracking-tight mb-8 animate-fade-up opacity-0" style={{ animationDelay: "0.4s", animationFillMode: "forwards" }}>
          {t("index.h1.line1")}<br />
          {t("index.h1.line2")}<span className="text-primary">{t("index.h1.competitors")}</span>.<br />
          <em className="not-italic text-secondary">{t("index.h1.line3")}</em>.
        </h1>

        <p className="font-serif font-light text-muted-foreground text-xl max-w-[560px] leading-relaxed mb-12 animate-fade-up opacity-0" style={{ animationDelay: "0.6s", animationFillMode: "forwards" }}>
          {t("index.subtitle")}
        </p>

        <div className="flex flex-wrap gap-3 animate-fade-up opacity-0" style={{ animationDelay: "0.8s", animationFillMode: "forwards" }}>
          <Link
            to="/compare"
            className="bg-primary text-primary-foreground px-6 py-3 rounded-sm font-display font-bold text-sm tracking-tight hover:opacity-90 transition-opacity"
          >
            {t("index.cta")}
          </Link>
          <span className="border border-primary/30 text-primary px-4 py-3 rounded-sm text-[11px] tracking-[2px] uppercase font-mono">
            {t("index.tag.cvm")}
          </span>
          <span className="border border-secondary/30 text-secondary px-4 py-3 rounded-sm text-[11px] tracking-[2px] uppercase font-mono">
            React + Vite
          </span>
          <span className="border border-accent/30 text-accent px-4 py-3 rounded-sm text-[11px] tracking-[2px] uppercase font-mono">
            {t("index.tag.realtime")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Index;
