const navItems = [
  { path: '/wallet', label: '지갑 홈' },
  { path: '/vc', label: 'VC 저장' },
  { path: '/vp', label: 'VP 생성' },
  { path: '/entry', label: '입장 증명' },
  { path: '/tickets', label: '티켓 목록' },
];

export default function Header({ currentPath, navigate }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate('/wallet')} type="button">
        <span className="brand-name">QRush</span>
        <span className="brand-tag">사용자 지갑 앱</span>
      </button>

      <nav className="topnav" aria-label="holder app pages">
        {navItems.map((item) => (
          <button
            key={item.path}
            className={currentPath === item.path ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate(item.path)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
