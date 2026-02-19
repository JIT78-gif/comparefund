import { Link, useLocation } from "react-router-dom";

const Navbar = () => {
  const location = useLocation();

  const linkClass = (path: string) =>
    `text-[11px] tracking-[2px] uppercase transition-colors ${
      location.pathname === path
        ? "text-primary"
        : "text-muted-foreground hover:text-primary"
    }`;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border px-6 md:px-[60px] py-4 flex items-center justify-between">
      <Link to="/" className="font-display font-extrabold text-sm tracking-tight text-foreground">
        FIDC<span className="text-primary">.</span>Intel
      </Link>
      <div className="hidden md:flex items-center gap-7">
        <Link to="/" className={linkClass("/")}>Dashboard</Link>
        <Link to="/compare" className={linkClass("/compare")}>Compare</Link>
      </div>
    </nav>
  );
};

export default Navbar;
