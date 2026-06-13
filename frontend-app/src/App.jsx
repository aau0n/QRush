import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import WalletHomePage from './pages/WalletHomePage.jsx';
import VcStorePage from './pages/VcStorePage.jsx';
import VpCreatePage from './pages/VpCreatePage.jsx';
import EntryProofPage from './pages/EntryProofPage.jsx';
import TicketWalletPage from './pages/TicketWalletPage.jsx';

function getPath() {
  return window.location.pathname === '/' ? '/wallet' : window.location.pathname;
}

export default function App() {
  const [path, setPath] = useState(getPath);

  useEffect(() => {
    const handlePopState = () => setPath(getPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  };

  const renderPage = () => {
    if (path === '/wallet') return <WalletHomePage />;
    if (path === '/vc') return <VcStorePage />;
    if (path === '/vp') return <VpCreatePage />;
    if (path === '/entry') return <EntryProofPage />;
    if (path === '/tickets') return <TicketWalletPage />;

    return <WalletHomePage />;
  };

  return (
    <div className="app-shell">
      <Header currentPath={path} navigate={navigate} />
      <main className="page">{renderPage()}</main>
    </div>
  );
}