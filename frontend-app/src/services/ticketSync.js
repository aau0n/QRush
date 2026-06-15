import { API_BASE_URL } from '../config.js';
import { ticketEvents } from '../data/ticketCatalog.js';
import { getAddress } from 'ethers';

function normalizeStatus(status) {
  return String(status || 'VALID').toUpperCase();
}

function findTicketEvent(eventId) {
  return ticketEvents.find((event) => event.id === eventId || event.id === `match-${String(eventId).padStart(3, '0')}`);
}

function getEventTitle(ticket, eventId) {
  return (
    ticket?.eventTitle ||
    ticket?.eventName ||
    ticket?.title ||
    ticket?.name ||
    ticket?.event?.title ||
    ticket?.event?.name ||
    findTicketEvent(eventId)?.title ||
    (eventId ? `Event ${eventId}` : 'QRush Ticket')
  );
}

function getEventDate(ticket, eventId) {
  const matchedEvent = findTicketEvent(eventId);

  return (
    ticket?.eventDate ||
    ticket?.date ||
    ticket?.event?.date ||
    (matchedEvent ? `${matchedEvent.date} ${matchedEvent.time}` : '-')
  );
}

function normalizeTicket(ticket) {
  const tokenId = String(ticket?.tokenId ?? ticket?.id ?? '');
  const eventId = ticket?.eventId ? String(ticket.eventId) : '';
  const seat = ticket?.seat || ticket?.seatId || '-';

  return {
    ...ticket,
    tokenId,
    eventId,
    eventTitle: getEventTitle(ticket, eventId),
    eventDate: getEventDate(ticket, eventId),
    seat,
    status: normalizeStatus(ticket?.status),
  };
}

function getWalletCandidates(walletAddress) {
  const trimmed = String(walletAddress || '').trim();
  const candidates = [trimmed];

  try {
    candidates.push(getAddress(trimmed));
  } catch {
    // Keep the original value if it is not a checksummable EVM address.
  }

  candidates.push(trimmed.toLowerCase());

  return [...new Set(candidates.filter(Boolean))];
}

async function requestTicketsByWallet(walletAddress) {
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

export async function fetchTicketsByWallet(walletAddress) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL이 설정되어 있지 않습니다.');
  }

  if (!walletAddress) {
    throw new Error('티켓을 조회할 지갑 주소가 없습니다.');
  }

  let lastError = null;

  for (const candidate of getWalletCandidates(walletAddress)) {
    try {
      const tickets = await requestTicketsByWallet(candidate);
      if (tickets.length > 0) return tickets;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}
