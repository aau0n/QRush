import { API_BASE_URL } from '../config.js';

function normalizeStatus(value) {
  const status = String(value || 'VALID').toUpperCase();
  if (status === 'USED' || status === 'INVALID' || status === 'EXPIRED') return status;
  return 'VALID';
}

function normalizeTicket(rawTicket) {
  const ticket = rawTicket?.ticket || rawTicket;
  const tokenId = ticket?.tokenId ?? ticket?.id ?? ticket?.nftTokenId;

  if (tokenId === null || tokenId === undefined || tokenId === '') return null;

  const eventId = ticket?.eventId ?? ticket?.event?.id ?? '';
  const seat = ticket?.seat ?? ticket?.seatLabel ?? ticket?.seatId ?? ticket?.seatNumber ?? '';

  return {
    tokenId: String(tokenId),
    eventTitle: ticket?.eventTitle || ticket?.eventName || ticket?.title || (eventId ? `Event ${eventId}` : 'QRush Ticket'),
    eventDate: ticket?.eventDate || ticket?.date || ticket?.event?.date || '',
    seat: String(seat || '-'),
    status: normalizeStatus(ticket?.status),
    owner: ticket?.owner || ticket?.holder || ticket?.buyerWallet || '',
    eventId: eventId ? String(eventId) : undefined,
    txHash: ticket?.txHash || ticket?.mintTxHash || undefined,
  };
}

export async function fetchTicketsByWallet(walletAddress) {
  if (!walletAddress) {
    throw new Error('지갑 주소가 없습니다.');
  }

  const response = await fetch(`${API_BASE_URL}/api/ticket/by-wallet/${encodeURIComponent(walletAddress)}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || body?.reason || `티켓 조회 실패 (${response.status})`);
  }

  const rawTickets = Array.isArray(body) ? body : body?.tickets || body?.data || [];
  return rawTickets.map(normalizeTicket).filter(Boolean);
}
