import { API_BASE_URL } from '../config.js';

function normalizeStatus(status) {
  return String(status || 'VALID').toUpperCase();
}

function normalizeTicket(ticket) {
  const tokenId = String(ticket?.tokenId ?? ticket?.id ?? '');
  const eventId = ticket?.eventId ? String(ticket.eventId) : '';
  const seat = ticket?.seat || ticket?.seatId || '-';

  return {
    ...ticket,
    tokenId,
    eventId,
    eventTitle: ticket?.eventTitle || (eventId ? `Event ${eventId}` : 'QRush Ticket'),
    eventDate: ticket?.eventDate || ticket?.date || '-',
    seat,
    status: normalizeStatus(ticket?.status),
  };
}

export async function fetchTicketsByWallet(walletAddress) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL이 설정되어 있지 않습니다.');
  }

  if (!walletAddress) {
    throw new Error('티켓을 조회할 지갑 주소가 없습니다.');
  }

  const response = await fetch(`${API_BASE_URL}/api/ticket/by-wallet/${encodeURIComponent(walletAddress)}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || body?.reason || `티켓 조회 실패 (${response.status})`);
  }

  const tickets = Array.isArray(body) ? body : body?.tickets || [];
  return tickets.map(normalizeTicket).filter((ticket) => ticket.tokenId);
}
