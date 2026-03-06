interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  color?: "green" | "blue" | "orange";
}

const colorMap = {
  green: "text-primary",
  blue: "text-secondary",
  orange: "text-destructive",
};

const MetricCard = ({ icon, label, value, subtitle, color = "green" }: MetricCardProps) => {
  return (
    <div className={`border bg-card p-5 md:p-6 rounded-md transition-colors flex flex-col justify-between ${color === "green" ? "border-primary/20 hover:border-primary/50" :
      color === "blue" ? "border-secondary/20 hover:border-secondary/50" :
        "border-border hover:border-border/80"
      }`}>
      <div className="flex flex-col gap-4">
        {icon}
        <p className="text-[10px] md:text-[11px] tracking-[2px] text-muted-foreground font-mono uppercase">
          {label}
        </p>
      </div>
      <div className="mt-4">
        <p className={`font-scifi font-black italic text-2xl md:text-[32px] tracking-widest ${colorMap[color]}`}>
          {value}
        </p>
        <p className="text-[11px] md:text-xs text-muted-foreground mt-2 font-mono">
          {subtitle}
        </p>
      </div>
    </div>
  );
};

export default MetricCard;
