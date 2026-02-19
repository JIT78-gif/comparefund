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
  orange: "text-accent",
};

const MetricCard = ({ icon, label, value, subtitle, color = "green" }: MetricCardProps) => {
  return (
    <div className="border border-border bg-card p-6 rounded-sm hover:bg-muted/30 transition-colors">
      <div className="mb-4">{icon}</div>
      <p className="text-[11px] tracking-[2px] uppercase text-muted-foreground font-mono mb-2">
        {label}
      </p>
      <p className={`font-display font-extrabold text-2xl md:text-3xl tracking-tight ${colorMap[color]}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
};

export default MetricCard;
