import { Link, useLocation } from "react-router-dom";

export default function Header() {
  const location = useLocation();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-title">Wallet App Prototype</div>
        <span className="mode-badge">DEMO MODE</span>
      </div>

      <nav className="topbar-nav">
        <Link
          to="/wallet"
          className={location.pathname === "/wallet" ? "nav-btn active" : "nav-btn"}
        >
          Wallet
        </Link>
        <Link
          to="/gate"
          className={location.pathname === "/gate" ? "nav-btn active" : "nav-btn"}
        >
          Gate
        </Link>
      </nav>
    </header>
  );
}