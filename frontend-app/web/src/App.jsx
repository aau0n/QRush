import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import WalletPage from "./pages/WalletPage";
import GatePage from "./pages/GatePage";

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page-container">
        <Routes>
          <Route path="/" element={<Navigate to="/wallet" replace />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/gate" element={<GatePage />} />
        </Routes>
      </main>
    </div>
  );
}