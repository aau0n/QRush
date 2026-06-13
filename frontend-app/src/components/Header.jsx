const navItems = [
  { path: '/wallet', label: '지갑 홈' },
  { path: '/vc', label: 'VC 저장' },
  { path: '/vp', label: 'VP 생성' },
  { path: '/entry', label: '입장 증명' },
  { path: '/tickets', label: '티켓 목록' },
];

export default function Header({ currentPath, navigate }) {
  return (
    <aside className="sidebar">
      <div>
        <p className="eyebrow">QRush Holder</p>
        <h1>사용자 지갑 앱</h1>
        <p className="sidebar-desc">
          VC 저장, VP 생성, 입장 증명 생성을 담당하는 Holder 프로토타입입니다.
        </p>
      </div>

      <nav className="nav-list" aria-label="holder app pages">
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

      <div className="sidebar-note">
        <strong>D 담당 범위</strong>
        <span>VC 수신/저장, 예매용 VP 생성, Gate nonce 기반 입장 proof 생성</span>
      </div>
    </aside>
  );
}