import { useState } from 'react';
import { getTicketsByWallet } from '../api/qrushApi.js';
import { mockEvents } from '../data/mockData.js';

function getEventTitle(ticket) {
  if (ticket.eventTitle) return ticket.eventTitle;
  return mockEvents.find((event) => event.id === ticket.eventId)?.title || ticket.eventId || '-';
}

function getSeatLabel(ticket) {
  return ticket.seat || ticket.seatId || '-';
}

export default function TicketsPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [resolvedWalletAddress, setResolvedWalletAddress] = useState('');
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const searchTickets = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const result = await getTicketsByWallet(walletAddress);
      setResolvedWalletAddress(result.walletAddress);
      setTickets(result.tickets);
      setStatus('done');
    } catch (error) {
      setErrorMessage(error.message || '티켓 조회에 실패했습니다.');
      setStatus('error');
    }
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">05 Tickets</p>
        <h2>티켓 확인</h2>
        <p>지갑 주소로 보유한 티켓을 확인하세요.</p>
      </div>

      <form className="panel search-form" onSubmit={searchTickets}>
        <label>
          지갑 주소
          <input
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="0x..."
            required
            type="text"
            value={walletAddress}
          />
        </label>
        <button className="primary-button" disabled={status === 'loading'} type="submit">
          {status === 'loading' ? '조회 중' : '티켓 조회'}
        </button>
      </form>

      {status === 'error' && <div className="panel error-text">{errorMessage}</div>}

      {status === 'done' && (
        <section className="panel">
          <div className="section-title">
            <h3>보유 티켓</h3>
            <span>{resolvedWalletAddress || walletAddress}</span>
          </div>

          <div className="ticket-table" role="table" aria-label="보유 티켓 목록">
            <div className="ticket-row header" role="row">
              <span>tokenId</span>
              <span>공연</span>
              <span>좌석</span>
              <span>상태</span>
            </div>
            {tickets.length > 0 ? (
              tickets.map((ticket) => (
                <div className="ticket-row" key={ticket.tokenId} role="row">
                  <span>{ticket.tokenId}</span>
                  <span>{getEventTitle(ticket)}</span>
                  <span>{getSeatLabel(ticket)}</span>
                  <span className={ticket.status === 'VALID' ? 'badge valid' : 'badge used'}>
                    {ticket.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="ticket-row" role="row">
                <span>-</span>
                <span>조회된 티켓이 없습니다</span>
                <span>-</span>
                <span>EMPTY</span>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
