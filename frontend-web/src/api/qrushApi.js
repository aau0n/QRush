import { mockEvents, mockTickets } from '../data/mockData.js';
import { API_BASE_URL, CHAIN_RPC_URL, IS_MOCK, TICKET_NFT_ADDRESS } from '../config.js';
import { randomId } from '../utils/hash.js';
import { Contract, JsonRpcProvider, getAddress } from 'ethers';

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
const TICKET_NFT_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getTicket(uint256 tokenId) view returns (tuple(uint256 eventId, uint256 seatId, uint256 issuedAt, uint8 status))',
  'event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 eventId, uint256 seatId)',
];
const TICKET_STATUS_LABELS = ['VALID', 'USED', 'CANCELLED'];

// 실제 서버가 설정돼 있으면 fetch, 아니면 mock 폴백.
async function request(path, options = {}, fallback) {
  if (IS_MOCK) {
    await delay();
    return fallback();
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const reason = (body && (body.error || body.reason)) || `HTTP ${response.status}`;
    const error = new Error(reason);
    error.body = body;
    throw error;
  }

  return body;
}

// POST /api/vc/register-vc  (C 어드민)
// body { vcHash(십진 문자열), issuer(0x...) } → { success, txHash }
export async function registerVcHash({ vcHash, issuer }) {
  const body = await request(
    '/api/vc/register-vc',
    { method: 'POST', body: JSON.stringify({ vcHash, issuer }) },
    () => ({ success: true, txHash: `0xmock${randomId().replaceAll('-', '')}` }),
  );

  return { success: Boolean(body?.success ?? true), txHash: body?.txHash };
}

// 공연 목록 — A 명세에 전용 엔드포인트가 없어 기본은 mock.
// VITE_EVENTS_PATH로 실제 경로를 주면 그쪽을 사용.
export async function fetchEvents() {
  const eventsPath = import.meta.env.VITE_EVENTS_PATH;
  if (!IS_MOCK && eventsPath) {
    const body = await request(eventsPath, { method: 'GET' }, () => ({ events: mockEvents }));
    return { events: body?.events || body || [] };
  }

  await delay();
  return { events: mockEvents };
}

// POST /api/vc/verify-vp  (C 웹 ← D 앱)
// body { vp, signature } → { success, verified, holder }
export async function verifyVp(vp, signature) {
  const body = await request(
    '/api/vc/verify-vp',
    { method: 'POST', body: JSON.stringify({ vp, signature }) },
    () => ({
      success: true,
      verified: Boolean(vp && signature),
      holder: vp?.holder,
      reason: vp && signature ? 'mock verified' : 'VP와 서명이 필요합니다.',
    }),
  );

  return {
    verified: Boolean(body?.verified),
    holder: body?.holder ?? vp?.holder,
    reason: body?.reason || body?.error || '',
  };
}

// POST /api/ticket/mint-ticket  (C 웹)
// body { eventId, seatId, buyerWallet } → { success, ticket:{tokenId,...}, txHash }
export async function mintTicket({ eventId, seatId, buyerWallet }) {
  const normalizedBuyerWallet = normalizeWalletAddress(buyerWallet);
  const body = await request(
    '/api/ticket/mint-ticket',
    { method: 'POST', body: JSON.stringify({ eventId, seatId, buyerWallet: normalizedBuyerWallet }) },
    () => ({
      success: true,
      ticket: { tokenId: Math.floor(100000 + Math.random() * 900000).toString() },
      txHash: `0xmock${randomId().replaceAll('-', '')}`,
    }),
  );

  return { tokenId: body?.ticket?.tokenId ?? body?.tokenId, txHash: body?.txHash };
}

// POST /api/gate/generate-nonce  (C 게이트 단말기)
// backend 반환: { nonce(십진 field — 회로/체인/verify-proof 입력용), nonceHex(참고용), expiresInSec }
// ⚠️ canonical 값은 "nonce"(십진). hex는 보조.
export async function generateNonce() {
  const body = await request(
    '/api/gate/generate-nonce',
    { method: 'POST' },
    () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const nonceHex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return { nonce: BigInt(`0x${nonceHex}`).toString(), nonceHex, expiresInSec: 30 };
    },
  );

  return {
    nonce: body?.nonce, // 십진 field (canonical)
    nonceHex: body?.nonceHex, // hex (참고용)
    expiresIn: body?.expiresInSec ?? body?.expiresIn ?? 30,
  };
}

function normalizeWalletAddress(walletAddress) {
  const trimmed = String(walletAddress || '').trim();

  try {
    return getAddress(trimmed);
  } catch {
    return trimmed;
  }
}

function getWalletCandidates(walletAddress) {
  const normalized = normalizeWalletAddress(walletAddress);
  return [...new Set([walletAddress, normalized, normalized.toLowerCase()].filter(Boolean))];
}

async function requestTicketsByWallet(walletAddress) {
  const body = await request(
    `/api/ticket/by-wallet/${encodeURIComponent(walletAddress)}`,
    { method: 'GET' },
    () => ({
      tickets: mockTickets.map((ticket) => ({ ...ticket, owner: walletAddress })),
    }),
  );

  const tickets = Array.isArray(body) ? body : body?.tickets || [];
  return tickets;
}

// GET /api/ticket/by-wallet/:wallet  (C 티켓 확인 페이지)
export async function getTicketsByWallet(walletAddress) {
  let lastError = null;

  for (const candidate of getWalletCandidates(walletAddress)) {
    try {
      const tickets = await requestTicketsByWallet(candidate);
      if (tickets.length > 0) return { walletAddress: candidate, tickets };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { walletAddress: normalizeWalletAddress(walletAddress), tickets: [] };
}

function fromChainSeatId(seatId) {
  const raw = String(seatId || '');
  if (!/^\d+$/.test(raw)) return raw || '-';

  const value = Number(raw);
  const row = Math.floor(value / 1000);
  const col = value % 1000;
  if (row >= 1 && row <= 26 && col >= 1) {
    return `${String.fromCharCode(64 + row)}${col}`;
  }

  return raw;
}

function fromChainEventId(eventId) {
  const raw = String(eventId || '');
  if (!/^\d+$/.test(raw)) return raw;
  return `match-${raw.padStart(3, '0')}`;
}

// A 서버가 내려간 상황에서 B 체인 RPC를 직접 조회한다.
// TicketMinted(to=wallet) 이벤트로 tokenId/eventId/seatId를 찾고 ownerOf로 현재 소유자를 재확인한다.
export async function getTicketsByWalletOnChain(walletAddress) {
  const normalizedWallet = getAddress(walletAddress);
  const provider = new JsonRpcProvider(CHAIN_RPC_URL);
  const ticketContract = new Contract(TICKET_NFT_ADDRESS, TICKET_NFT_ABI, provider);
  const filter = ticketContract.filters.TicketMinted(null, normalizedWallet);
  const logs = await ticketContract.queryFilter(filter, 0, 'latest');

  const tickets = [];
  for (const log of logs) {
    const tokenId = log.args.tokenId.toString();
    const owner = await ticketContract.ownerOf(tokenId);
    if (owner.toLowerCase() !== normalizedWallet.toLowerCase()) continue;

    const ticketData = await ticketContract.getTicket(tokenId);
    const eventId = fromChainEventId(ticketData.eventId?.toString() || log.args.eventId?.toString());
    const seatId = fromChainSeatId(ticketData.seatId?.toString() || log.args.seatId?.toString());
    const statusIndex = Number(ticketData.status ?? 0);
    tickets.push({
      tokenId,
      eventId,
      seatId,
      owner,
      status: TICKET_STATUS_LABELS[statusIndex] || 'ON_CHAIN',
      source: 'chain',
    });
  }

  return {
    walletAddress: normalizedWallet,
    tickets,
    source: 'chain',
    rpcUrl: CHAIN_RPC_URL,
    contractAddress: TICKET_NFT_ADDRESS,
  };
}

// GET /api/gate/result/:nonce  (C 게이트 단말기 폴링)
// A가 verify-proof 결과를 nonce(십진 field)로 저장해두면 게이트가 폴링해 초록/빨강 표시.
// C가 기대하는 응답(권장 — A는 이 형태로 구현):
//   대기:  { decided: false }            또는 HTTP 404
//   입장:  { decided: true, entry: true,  tokenId, txHash, publicSignals }
//   거부:  { decided: true, entry: false, reason, publicSignals? }
// publicSignals[isAdult, vcHash, nonce, tokenId, currentDate]가 오면
// 게이트의 '검증자가 본 것' 패널에 그대로 노출한다(없어도 동작).
// ※ {status:'waiting'|'allowed'|'denied'} 형태도 호환되게 정규화한다.
export async function getGateResult(nonce) {
  if (IS_MOCK || !nonce) return { decided: false };

  try {
    const res = await fetch(`${API_BASE_URL}/api/gate/result/${encodeURIComponent(nonce)}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 404) return { decided: false };

    const body = await res.json().catch(() => null);
    if (!body) return { decided: false };

    if (body.status) {
      const allowed = body.status === 'allowed';
      const denied = body.status === 'denied';
      if (!allowed && !denied) return { decided: false };
      return {
        decided: true,
        entry: allowed,
        reason: body.reason,
        tokenId: body.tokenId,
        txHash: body.txHash,
        publicSignals: body.publicSignals,
      };
    }

    if (typeof body.entry === 'boolean') {
      return {
        decided: body.decided ?? true,
        entry: body.entry,
        reason: body.reason || body.error,
        tokenId: body.tokenId,
        txHash: body.txHash,
        publicSignals: body.publicSignals,
      };
    }

    return {
      decided: Boolean(body.decided),
      entry: Boolean(body.entry),
      reason: body.reason,
      publicSignals: body.publicSignals,
    };
  } catch {
    // 엔드포인트 미구현/네트워크 오류 — 조용히 대기 상태 유지(mock 버튼 폴백).
    return { decided: false };
  }
}
