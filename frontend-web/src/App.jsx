import { useEffect, useState } from 'react';
import './App.css';
import BookingPage from './pages/BookingPage.jsx';
import EventsPage from './pages/EventsPage.jsx';
import GatePage from './pages/GatePage.jsx';
import IssuerPage from './pages/IssuerPage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';

const navItems = [
  { path: '/issuer', label: 'VC 발급' },
  { path: '/events', label: '공연 목록' },
  { path: '/booking', label: '예매' },
  { path: '/gate', label: '게이트' },
  { path: '/tickets', label: '티켓 확인' },
];

function getPath() {
  return window.location.pathname === '/' ? '/issuer' : window.location.pathname;
}

function App() {
  const [path, setPath] = useState(getPath);

  useEffect(() => {
    const handlePopState = () => setPath(getPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath) => {
    window.history.pushState({}, '', nextPath);
    // 상태엔 쿼리스트링을 뺀 경로만 저장 — '/booking?eventId=..'도 '/booking'으로 매칭.
    setPath(nextPath.split('?')[0]);
  };

  const renderPage = () => {
    if (path === '/events') return <EventsPage navigate={navigate} />;
    if (path === '/booking') return <BookingPage />;
    if (path === '/gate') return <GatePage />;
    if (path === '/tickets') return <TicketsPage />;
    return <IssuerPage />;
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('/events')} type="button">
          <span className="brand-name">QRush</span>
          <span className="brand-tag">DID와 NFT를 이용한 새로운 티켓 시스템</span>
        </button>

        <nav className="topnav" aria-label="QRush web pages">
          {navItems.map((item) => (
            <button
              className={path === item.path ? 'nav-item active' : 'nav-item'}
              key={item.path}
              onClick={() => navigate(item.path)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="page">{renderPage()}</main>
    </div>
  );
}

export default App;
