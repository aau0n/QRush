import { useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import {
  loadHolderProfile,
  loadTickets,
  loadVc,
} from '../services/storage.js';

function shortenAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletHomePage() {
  const [profile] = useState(() => loadHolderProfile(null));
  const [savedVc] = useState(() => loadVc(null));
  const [tickets] = useState(() => loadTickets([]));

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">01 Wallet Home</p>
        <h2>사용자 지갑 홈</h2>
        <p>
          사용자의 DID, 지갑 주소, VC 저장 상태, 보유 티켓 상태를 보여주는 Holder 앱 첫 화면입니다.
        </p>
      </div>

      <div className="grid-3">
        <section className="panel stat-card">
          <span>DID</span>
          <strong>{profile?.holderDid || '-'}</strong>
        </section>

        <section className="panel stat-card">
          <span>지갑 주소</span>
          <strong>{shortenAddress(profile?.walletAddress)}</strong>
        </section>

        <section className="panel stat-card">
          <span>보유 티켓</span>
          <strong>{tickets.length}개</strong>
        </section>
      </div>

      <section className={savedVc ? 'panel status-panel success' : 'panel status-panel warning'}>
        <div>
          <h3>{savedVc ? 'VC 저장 완료' : 'VC가 아직 저장되지 않았습니다'}</h3>
          <p>
            {savedVc
              ? 'VC 저장 화면에서 수신한 신원 VC가 localStorage에 저장되어 있습니다.'
              : 'VC 저장 화면에서 C 웹의 VC QR/JSON을 받아 저장해야 합니다.'}
          </p>
        </div>
      </section>

      <JsonPreview title="Holder Profile JSON" data={profile} />
    </section>
  );
}
