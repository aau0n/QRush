import { mockEvents, mockTickets } from '../data/mockData.js';
import { API_BASE_URL, IS_MOCK } from '../config.js';

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

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
    () => ({ success: true, txHash: `0xmock${crypto.randomUUID().replaceAll('-', '')}` }),
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
  const body = await request(
    '/api/ticket/mint-ticket',
    { method: 'POST', body: JSON.stringify({ eventId, seatId, buyerWallet }) },
    () => ({
      success: true,
      ticket: { tokenId: Math.floor(100000 + Math.random() * 900000).toString() },
      txHash: `0xmock${crypto.randomUUID().replaceAll('-', '')}`,
    }),
  );

  return { tokenId: body?.ticket?.tokenId ?? body?.tokenId, txHash: body?.txHash };
}

// POST /api/gate/generate-nonce  (C 게이트 단말기)
// → { nonce(hex 32자), nonceField(십진), expiresInSec }
export async function generateNonce() {
  const body = await request(
    '/api/gate/generate-nonce',
    { method: 'POST' },
    () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return { nonce, nonceField: BigInt(`0x${nonce}`).toString(), expiresInSec: 30 };
    },
  );

  return {
    nonce: body?.nonce,
    nonceField: body?.nonceField,
    expiresIn: body?.expiresInSec ?? body?.expiresIn ?? 30,
  };
}

// GET /api/ticket/by-wallet/:wallet  (C 티켓 확인 페이지)
export async function getTicketsByWallet(walletAddress) {
  const body = await request(
    `/api/ticket/by-wallet/${encodeURIComponent(walletAddress)}`,
    { method: 'GET' },
    () => ({
      tickets: mockTickets.map((ticket) => ({ ...ticket, owner: walletAddress })),
    }),
  );

  const tickets = Array.isArray(body) ? body : body?.tickets || [];
  return { walletAddress, tickets };
}
