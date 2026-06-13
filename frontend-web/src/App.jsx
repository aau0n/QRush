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
    setPath(nextPath);
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
      <aside className="sidebar">
        <div>
          <p className="eyebrow">QRush Web</p>
          <h1>예매 사이트와 게이트 단말기</h1>
        </div>

        <nav className="nav-list" aria-label="QRush web pages">
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

        <div className="sidebar-note">
          <strong>C 담당 범위</strong>
          <span>VC 발급, 예매 화면, VP 검증 연동, 게이트 nonce QR, 티켓 조회</span>
        </div>
      </aside>

      <main className="page">{renderPage()}</main>
    </div>
  );
}

export default App;
