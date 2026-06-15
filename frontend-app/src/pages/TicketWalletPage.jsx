import { useMemo, useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import TicketCard from '../components/TicketCard.jsx';
import { API_BASE_URL, API_BASE_URL_SOURCE, IS_MOCK } from '../config.js';
import {
  clearSelectedTicket,
  loadHolderProfile,
  loadLastVp,
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

function getInitialWalletAddress(profile) {
  return loadLastVp(null)?.walletAddress || profile?.walletAddress || '';
}

function getTicketKey(ticket) {
  if (!ticket) return '';
  return (
    ticket.ticketKey ||
    ticket._id ||
    ticket.ticketId ||
    ticket.id ||
    `${ticket.tokenId || 'ticket'}-${ticket.eventId || ticket.eventTitle || ''}-${ticket.seatId || ticket.seat || ''}`
  );
}

export default function TicketWalletPage() {
  const [profile, setProfile] = useState(() => {
    return loadHolderProfile(null);
  });
  const [walletAddress, setWalletAddress] = useState(() => getInitialWalletAddress(profile));
  const [tickets, setTickets] = useState(() => loadTickets([]));
  const [selectedTicket, setSelectedTicket] = useState(() => loadSelectedTicket());
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

  const handleSelectTicket = (ticket) => {
    setSelectedTicket(ticket);
    saveSelectedTicket(ticket);

    setStatusMessage(
      ticket.status === 'VALID'
        ? `입장 증명에 사용할 티켓 #${ticket.tokenId}를 선택했습니다.`
        : `#${ticket.tokenId}는 ${ticket.status} 상태라 입장 증명에 사용할 수 없습니다.`,
    );
  };

  const syncTickets = async () => {
    setStatusMessage('');
    setError('');
    setIsSyncing(true);

    try {
      const syncedTickets = await fetchTicketsByWallet(walletAddress);
      saveTickets(syncedTickets);
      setTickets(syncedTickets);

      const nextSelectedTicket =
        syncedTickets.find((ticket) => ticket.status === 'VALID') ||
        syncedTickets[0] ||
        null;

      if (nextSelectedTicket) {
        saveSelectedTicket(nextSelectedTicket);
        setSelectedTicket(nextSelectedTicket);
      } else {
        clearSelectedTicket();
        setSelectedTicket(null);
      }

      const nextProfile = {
        ...profile,
        walletAddress,
      };
      saveHolderProfile(nextProfile);
      setProfile(nextProfile);

      setStatusMessage(
        nextSelectedTicket
          ? `블록체인 서버에서 티켓 ${syncedTickets.length}개를 동기화하고 #${nextSelectedTicket.tokenId}를 선택했습니다.`
          : '블록체인 서버에서 조회된 티켓이 없습니다. 예매에 사용한 MetaMask 주소인지 확인해 주세요.',
      );
    } catch (nextError) {
      setError(nextError.message || '티켓 동기화에 실패했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearSelection = () => {
    clearSelectedTicket();
    setSelectedTicket(null);
    setStatusMessage('선택한 티켓을 초기화했습니다.');
    setError('');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">05 Ticket Wallet</p>
        <h2>보유 티켓 목록</h2>
        <p>예매에 사용한 MetaMask 주소로 서버에서 NFT 티켓을 가져오고, 입장 증명에 사용할 티켓을 선택합니다.</p>
      </div>

      <div className="grid-3">
        <section className="panel stat-card">
          <span>지갑 주소</span>
          <strong>{shortenAddress(walletAddress)}</strong>
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

      <section className="panel form-panel">
        <div className="section-title">
          <h3>블록체인 서버 티켓 동기화</h3>
          <span>{API_BASE_URL}/api/ticket/by-wallet/:wallet</span>
        </div>

        <label>
          지갑 주소
          <input
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="0x..."
          />
        </label>

        <div className="button-row">
          <button className="primary-button" type="button" onClick={syncTickets} disabled={isSyncing || !walletAddress || IS_MOCK}>
            {isSyncing ? '동기화 중' : '서버에서 티켓 불러오기'}
          </button>
        </div>

        {!IS_MOCK && API_BASE_URL_SOURCE === 'auto' && (
          <p className="hint-text">
            .env가 없어 현재 앱 주소 기준으로 백엔드 주소를 자동 설정했습니다. 서버가 다른 PC라면
            frontend-app/.env에 VITE_API_BASE_URL을 직접 넣어 주세요.
          </p>
        )}
        {IS_MOCK && <p className="error-text">백엔드 주소를 찾을 수 없어 서버 조회가 비활성화되어 있습니다.</p>}
      </section>

      <section className={selectedTicket ? 'panel status-panel success' : 'panel status-panel warning'}>
        <div>
          <h3>{selectedTicket ? `선택한 티켓 #${selectedTicket.tokenId}` : '선택한 티켓 없음'}</h3>
          <p>
            {selectedTicket
              ? `${selectedTicket.eventTitle} / ${selectedTicket.seat} / ${selectedTicket.status}`
              : '입장 증명에 사용할 티켓을 먼저 선택해 주세요.'}
          </p>
        </div>

        <div className="button-row">
          <button className="secondary-button" type="button" onClick={handleClearSelection} disabled={!selectedTicket}>
            선택 초기화
          </button>
        </div>
      </section>

      {statusMessage && <p className="success-text">{statusMessage}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="ticket-grid">
        {tickets.length > 0 ? (
          tickets.map((ticket) => (
            <TicketCard
              key={getTicketKey(ticket)}
              ticket={ticket}
              selected={getTicketKey(selectedTicket) === getTicketKey(ticket)}
              onSelect={handleSelectTicket}
            />
          ))
        ) : (
          <div className="panel empty-state">
            <h3>보유 티켓이 없습니다</h3>
            <p>예매를 완료한 MetaMask 주소로 서버 동기화를 실행해 주세요.</p>
          </div>
        )}
      </section>

      <JsonPreview title="Selected Ticket JSON" data={selectedTicket} />
    </section>
  );
}
