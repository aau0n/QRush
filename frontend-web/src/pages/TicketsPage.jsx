import { useState } from 'react';
import { getTicketsByWallet, getTicketsByWalletOnChain } from '../api/qrushApi.js';
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
  const [lookupSource, setLookupSource] = useState('');
  const [lookupMeta, setLookupMeta] = useState(null);
  const [serverErrorMessage, setServerErrorMessage] = useState('');

  const showResult = (result, source, meta = {}) => {
    setResolvedWalletAddress(result.walletAddress);
    setTickets(result.tickets);
    setLookupSource(source);
    setLookupMeta(meta);
    setStatus('done');
  };

  const searchTickets = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setErrorMessage('');
    setServerErrorMessage('');
    setLookupSource('');
    setLookupMeta(null);

    try {
      const result = await getTicketsByWallet(walletAddress);
      showResult(result, 'server');
    } catch (serverError) {
      const serverMessage = serverError.message || 'A 서버 티켓 조회에 실패했습니다.';
      setServerErrorMessage(serverMessage);

      try {
        const chainResult = await getTicketsByWalletOnChain(walletAddress);
        showResult(chainResult, 'chain', {
          contractAddress: chainResult.contractAddress,
          fallbackFromServer: true,
          rpcUrl: chainResult.rpcUrl,
        });
      } catch (chainError) {
        setErrorMessage(
          `A 서버 조회 실패: ${serverMessage} / B 체인 직접조회 실패: ${
            chainError.message || '체인 조회에 실패했습니다.'
          }`,
        );
        setStatus('error');
      }
    }
  };

  const searchTicketsOnChain = async () => {
    setStatus('loading');
    setErrorMessage('');
    setServerErrorMessage('');
    setLookupSource('');
    setLookupMeta(null);

    try {
      const result = await getTicketsByWalletOnChain(walletAddress);
      showResult(result, 'chain', {
        contractAddress: result.contractAddress,
        fallbackFromServer: false,
        rpcUrl: result.rpcUrl,
      });
    } catch (error) {
      setErrorMessage(error.message || 'B 체인 직접조회에 실패했습니다.');
      setStatus('error');
    }
  };

  const isLoading = status === 'loading';
  const sourceLabel = lookupSource === 'chain' ? 'B 체인 직접조회' : 'A 서버 조회';

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
          {isLoading ? '조회 중' : '티켓 조회'}
        </button>
        <button
          className="secondary-button"
          disabled={isLoading || !walletAddress.trim()}
          onClick={searchTicketsOnChain}
          type="button"
        >
          서버 없이 체인 직접조회
        </button>
      </form>

      {status === 'error' && <div className="panel error-text">{errorMessage}</div>}

      {status === 'done' && (
        <section className="panel">
          <div className="section-title">
            <h3>보유 티켓</h3>
            <span>
              {resolvedWalletAddress || walletAddress} · {sourceLabel}
            </span>
          </div>

          {lookupSource === 'chain' && (
            <p className="hint-text">
              {lookupMeta?.fallbackFromServer
                ? 'A 서버 조회 실패 후 B 체인에서 직접 조회했습니다.'
                : 'A 서버를 거치지 않고 B 체인에서 직접 조회했습니다.'}
              {lookupMeta?.fallbackFromServer && serverErrorMessage ? ' A 서버는 현재 연결되지 않습니다.' : ''}
              {lookupMeta?.rpcUrl ? ` RPC: ${lookupMeta.rpcUrl}` : ''}
              {lookupMeta?.contractAddress ? ` / Contract: ${lookupMeta.contractAddress}` : ''}
            </p>
          )}

          <div className="ticket-table" role="table" aria-label="보유 티켓 목록">
            <div className="ticket-row header" role="row">
              <span>tokenId</span>
              <span>공연</span>
              <span>좌석</span>
              <span>상태</span>
            </div>
            {tickets.length > 0 ? (
              tickets.map((ticket) => (
                <div
                  className="ticket-row"
                  key={`${ticket.source || lookupSource || 'ticket'}-${ticket.tokenId}-${getSeatLabel(ticket)}`}
                  role="row"
                >
                  <span>{ticket.tokenId}</span>
                  <span>{getEventTitle(ticket)}</span>
                  <span>{getSeatLabel(ticket)}</span>
                  <span
                    className={
                      ticket.status === 'VALID' || ticket.status === 'ON_CHAIN' ? 'badge valid' : 'badge used'
                    }
                  >
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
