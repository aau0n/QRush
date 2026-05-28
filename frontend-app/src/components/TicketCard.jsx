export default function TicketCard({ ticket, selected, onSelect }) {
  const isValid = ticket.status === 'VALID';

  return (
    <article className={selected ? 'ticket-card selected' : 'ticket-card'}>
      <div className="ticket-card-top">
        <div>
          <p className="ticket-token">NFT Ticket #{ticket.tokenId}</p>
          <h3>{ticket.eventTitle}</h3>
        </div>

        <span className={isValid ? 'badge valid' : 'badge used'}>
          {ticket.status}
        </span>
      </div>

      <dl className="ticket-meta">
        <div>
          <dt>일시</dt>
          <dd>{ticket.eventDate}</dd>
        </div>
        <div>
          <dt>좌석</dt>
          <dd>{ticket.seat}</dd>
        </div>
      </dl>

      <button
        className={selected ? 'primary-button' : 'secondary-button'}
        type="button"
        onClick={() => onSelect(ticket)}
      >
        {selected ? '선택됨' : '이 티켓 선택'}
      </button>
    </article>
  );
}