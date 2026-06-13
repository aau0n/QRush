import { useEffect, useMemo, useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import TicketCard from '../components/TicketCard.jsx';
import { mockHolderProfile, mockTickets } from '../data/mockWalletData.js';
import {
  clearSelectedTicket,
  loadHolderProfile,
  loadSelectedTicket,
  loadTickets,
  saveHolderProfile,
  saveSelectedTicket,
  saveTickets,
} from '../services/storage.js';

function shortenAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function TicketWalletPage() {
  const [profile, setProfile] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const currentProfile = loadHolderProfile(mockHolderProfile);
    const currentTickets = loadTickets(mockTickets);
    const currentSelectedTicket = loadSelectedTicket();

    saveHolderProfile(currentProfile);
    saveTickets(currentTickets);

    setProfile(currentProfile);
    setTickets(currentTickets);
    setSelectedTicket(currentSelectedTicket);
  }, []);

  const validTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'VALID'),
    [tickets],
  );

  const usedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'VALID'),
    [tickets],
  );

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
        <p>
          사용자가 보유한 NFT 티켓을 확인하고, 입장 증명에 사용할 티켓을 선택하는 화면입니다.
        </p>
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
              : '입장 증명 화면에서 사용할 티켓을 먼저 선택해 주세요.'}
          </p>
        </div>

        <div className="button-row">
          <button className="secondary-button" type="button" onClick={handleClearSelection} disabled={!selectedTicket}>
            선택 초기화
          </button>
          <button className="secondary-button" type="button" onClick={handleResetTickets}>
            demo 티켓 복구
          </button>
        </div>
      </section>

      {statusMessage && <p className="success-text">{statusMessage}</p>}

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

      <JsonPreview
        title="Selected Ticket JSON"
        data={selectedTicket}
      />
    </section>
  );
}