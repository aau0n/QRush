import { useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import { mockHolderProfile, mockTickets } from '../data/mockWalletData.js';
import { connectMetaMaskAccount, getConnectedMetaMaskAccount } from '../services/metamaskConnect.js';
import {
  loadHolderProfile,
  loadTickets,
  loadVc,
  saveHolderProfile,
  saveTickets,
} from '../services/storage.js';

function shortenAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function profileWithWallet(profile, walletAddress) {
  if (!walletAddress) return profile;
  return {
    ...profile,
    walletAddress,
    holderDid: profile?.holderDid?.startsWith('did:qrush:user-')
      ? profile.holderDid
      : `did:qrush:user-${walletAddress.slice(2, 10).toLowerCase()}`,
  };
}

export default function WalletHomePage() {
  const [profile, setProfile] = useState(() =>
    profileWithWallet(loadHolderProfile(mockHolderProfile), getConnectedMetaMaskAccount()),
  );
  const [savedVc, setSavedVc] = useState(() => loadVc(null));
  const [tickets, setTickets] = useState(() => loadTickets(mockTickets));
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const connectWallet = async () => {
    setError('');
    setStatusMessage('');

    try {
      const walletAddress = await connectMetaMaskAccount();
      const nextProfile = profileWithWallet(profile, walletAddress);
      saveHolderProfile(nextProfile);
      setProfile(nextProfile);
      setStatusMessage(`MetaMask 지갑 연결 완료: ${shortenAddress(walletAddress)}`);
    } catch (nextError) {
      setError(nextError.message || 'MetaMask 지갑 연결에 실패했습니다.');
    }
  };

  const resetDemoData = () => {
    const connectedWallet = getConnectedMetaMaskAccount();
    const nextProfile = profileWithWallet(mockHolderProfile, connectedWallet);
    saveHolderProfile(nextProfile);
    saveTickets(mockTickets);
    setProfile(nextProfile);
    setTickets(mockTickets);
    setSavedVc(loadVc(null));
    setStatusMessage('데모 기본 데이터를 복구했습니다.');
    setError('');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">01 Wallet Home</p>
        <h2>사용자 지갑 홈</h2>
        <p>MetaMask 계정, DID, VC 저장 상태, 보유 티켓 상태를 확인하는 Holder 첫 화면입니다.</p>
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

      <section className={profile?.walletAddress ? 'panel status-panel success' : 'panel status-panel warning'}>
        <div>
          <h3>{profile?.walletAddress ? 'MetaMask 지갑 연결됨' : '지갑 연결 필요'}</h3>
          <p>
            {profile?.walletAddress
              ? `현재 Holder 주소는 ${profile.walletAddress} 입니다.`
              : '예매 VP 서명 전에 MetaMask 지갑을 연결해 주세요.'}
          </p>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={connectWallet} type="button">
            MetaMask 지갑 연결
          </button>
          <button className="secondary-button" onClick={resetDemoData} type="button">
            데모 기본값 복구
          </button>
        </div>
      </section>

      <section className={savedVc ? 'panel status-panel success' : 'panel status-panel warning'}>
        <div>
          <h3>{savedVc ? 'VC 저장 완료' : 'VC가 아직 저장되지 않음'}</h3>
          <p>
            {savedVc
              ? 'VC 저장 화면에서 받은 신원 VC가 이 브라우저에 저장되어 있습니다.'
              : 'VC 발급 QR을 스캔해 D 앱 VC 저장 화면에서 저장해야 합니다.'}
          </p>
        </div>
      </section>

      {statusMessage && <p className="success-text">{statusMessage}</p>}
      {error && <p className="error-text">{error}</p>}

      <JsonPreview title="Holder Profile JSON" data={profile} />
    </section>
  );
}
