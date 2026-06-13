import { useState } from 'react';
import { getTicketsByWallet } from '../api/qrushApi.js';

export default function TicketsPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState('idle');

  const searchTickets = async (event) => {
    event.preventDefault();
    setStatus('loading');

    try {
      const result = await getTicketsByWallet(walletAddress);
      setTickets(result.tickets);
      setStatus('done');
    } catch {
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

      {status === 'error' && <div className="panel error-text">티켓 조회에 실패했습니다.</div>}

      {status === 'done' && (
        <section className="panel">
          <div className="section-title">
            <h3>보유 티켓</h3>
            <span>{walletAddress}</span>
          </div>

          <div className="ticket-table" role="table" aria-label="보유 티켓 목록">
            <div className="ticket-row header" role="row">
              <span>tokenId</span>
              <span>공연</span>
              <span>좌석</span>
              <span>상태</span>
            </div>
            {tickets.map((ticket) => (
              <div className="ticket-row" key={ticket.tokenId} role="row">
                <span>{ticket.tokenId}</span>
                <span>{ticket.eventTitle}</span>
                <span>{ticket.seat}</span>
                <span className={ticket.status === 'VALID' ? 'badge valid' : 'badge used'}>
                  {ticket.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
