export default function TicketCard({ ticket, onEnter }) {
  return (
    <div className="ticket-card">
      <div className="ticket-card-header">
        <h3>{ticket.eventName}</h3>
        <span className={ticket.isUsed ? "badge used" : "badge available"}>
          {ticket.isUsed ? "사용 완료" : "사용 가능"}
        </span>
      </div>

      <div className="ticket-row">
        <span className="label">일시</span>
        <span>{ticket.eventDate}</span>
      </div>

      <div className="ticket-row">
        <span className="label">좌석</span>
        <span>{ticket.seat}</span>
      </div>

      <div className="ticket-row">
        <span className="label">Token ID</span>
        <span>#{ticket.tokenId}</span>
      </div>

      <div className="ticket-row">
        <span className="label">Owner DID</span>
        <span className="mono">{ticket.ownerDid}</span>
      </div>

      <button
        className="primary-btn"
        onClick={() => onEnter(ticket)}
        disabled={ticket.isUsed}
      >
        입장하기
      </button>
    </div>
  );
}