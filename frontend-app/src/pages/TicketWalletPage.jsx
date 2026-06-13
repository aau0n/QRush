import { useMemo, useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import TicketCard from '../components/TicketCard.jsx';
import { mockHolderProfile, mockTickets } from '../data/mockWalletData.js';
import { getConnectedMetaMaskAccount } from '../services/metamaskConnect.js';
import {
  clearSelectedTicket,
  loadHolderProfile,
  loadSelectedTicket,
  loadTickets,
  saveHolderProfile,
  saveSelectedTicket,
  saveTickets,
} from '../services/storage.js';
import { fetchTicketsByWallet } from '../services/ticketSync.js';

function shortenAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function withConnectedWallet(profile) {
  const connectedWallet = getConnectedMetaMaskAccount();
  return connectedWallet ? { ...profile, walletAddress: connectedWallet } : profile;
}

function pickSelectedTicket(tickets, selectedTicket) {
  if (!tickets.length) return null;
  return tickets.find((ticket) => ticket.tokenId === selectedTicket?.tokenId) || tickets[0];
}

export default function TicketWalletPage() {
  const [profile] = useState(() => {
    const currentProfile = withConnectedWallet(loadHolderProfile(mockHolderProfile));
    saveHolderProfile(currentProfile);
    return currentProfile;
  });
  const [tickets, setTickets] = useState(() => loadTickets([]));
  const [selectedTicket, setSelectedTicket] = useState(() => loadSelectedTicket(null));
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const validTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'VALID'),
    [tickets],
  );

  const usedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'VALID'),
    [tickets],
  );

  const syncTickets = async () => {
    setError('');
    setStatusMessage('');
    setIsSyncing(true);

    try {
      const walletAddress = profile?.walletAddress || getConnectedMetaMaskAccount();
      const nextTickets = await fetchTicketsByWallet(walletAddress);
      const nextSelectedTicket = pickSelectedTicket(nextTickets, selectedTicket);

      saveTickets(nextTickets);
      setTickets(nextTickets);

      if (nextSelectedTicket) {
        saveSelectedTicket(nextSelectedTicket);
        setSelectedTicket(nextSelectedTicket);
      } else {
        clearSelectedTicket();
        setSelectedTicket(null);
      }

      setStatusMessage(`서버에서 티켓 ${nextTickets.length}개를 동기화했습니다.`);
    } catch (nextError) {
      setError(nextError.message || '티켓 동기화에 실패했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectTicket = (ticket) => {
    setSelectedTicket(ticket);
    saveSelectedTicket(ticket);

    setStatusMessage(
      ticket.status === 'VALID'
        ? `입장 증명에 사용할 티켓 #${ticket.tokenId}를 선택했습니다.`
        : `#${ticket.tokenId}는 ${ticket.status} 상태이므로 입장 증명에 사용할 수 없습니다.`,
    );
  };

  const handleResetTickets = () => {
    saveTickets(mockTickets);
    setTickets(mockTickets);
    setStatusMessage('티켓 목록을 demo 기본값으로 복구했습니다.');
    setError('');
  };

  const handleClearSelection = () => {
    clearSelectedTicket();
    setSelectedTicket(null);
    setStatusMessage('선택된 티켓을 초기화했습니다.');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">05 Ticket Wallet</p>
        <h2>보유 티켓 목록</h2>
        <p>예매 완료 후 서버에서 현재 지갑 주소의 NFT 티켓을 가져와 D 앱에 저장합니다.</p>
      </div>

      <div className="grid-3">
        <section className="panel stat-card">
          <span>지갑 주소</span>
          <strong>{shortenAddress(profile?.walletAddress)}</strong>
        </section>

        <section className="panel stat-card">
          <span>사용 가능 티켓</span>
          <strong>{validTickets.length}개</strong>
        </section>

        <section className="panel stat-card">
          <span>사용 완료/기타</span>
          <strong>{usedTickets.length}개</strong>
        </section>
      </div>

      <section className={selectedTicket ? 'panel status-panel success' : 'panel status-panel warning'}>
        <div>
          <h3>{selectedTicket ? `선택된 티켓 #${selectedTicket.tokenId}` : '선택된 티켓 없음'}</h3>
          <p>
            {selectedTicket
              ? `${selectedTicket.eventTitle} / ${selectedTicket.seat} / ${selectedTicket.status}`
              : '서버 동기화 후 입장 증명에 사용할 티켓을 선택해 주세요.'}
          </p>
        </div>

        <div className="button-row">
          <button className="primary-button" type="button" onClick={syncTickets} disabled={isSyncing}>
            {isSyncing ? '동기화 중' : '서버 티켓 동기화'}
          </button>
          <button className="secondary-button" type="button" onClick={handleClearSelection} disabled={!selectedTicket}>
            선택 초기화
          </button>
          <button className="secondary-button" type="button" onClick={handleResetTickets}>
            demo 티켓 복구
          </button>
        </div>
      </section>

      {statusMessage && <p className="success-text">{statusMessage}</p>}
      {error && <p className="error-text">{error}</p>}

      {tickets.length > 0 ? (
        <section className="ticket-grid">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.tokenId}
              ticket={ticket}
              selected={selectedTicket?.tokenId === ticket.tokenId}
              onSelect={handleSelectTicket}
            />
          ))}
        </section>
      ) : (
        <section className="panel empty-state">
          <h3>저장된 티켓이 없습니다</h3>
          <p>예매를 완료했다면 서버 티켓 동기화를 눌러 현재 지갑의 티켓을 가져오세요.</p>
        </section>
      )}

      <JsonPreview
        title="Selected Ticket JSON"
        data={selectedTicket}
      />
    </section>
  );
}
