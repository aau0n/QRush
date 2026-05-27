import { mockEvents, mockTickets } from '../data/mockData.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}, fallback) {
  if (!API_BASE_URL) {
    await delay();
    return fallback();
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

export async function registerVcHash(vcHash, vc) {
  return request(
    '/register-vc-hash',
    {
      method: 'POST',
      body: JSON.stringify({ vcHash, vc }),
    },
    () => ({
      registered: true,
      vcHash,
      issuer: vc.issuer,
    }),
  );
}

export async function fetchEvents() {
  return request('/events', { method: 'GET' }, () => ({ events: mockEvents }));
}

export async function verifyVp(vp, signature) {
  return request(
    '/verify-vp',
    {
      method: 'POST',
      body: JSON.stringify({ vp, signature }),
    },
    () => ({
      verified: Boolean(vp && signature),
      reason: vp && signature ? 'mock verified' : 'VP와 서명이 필요합니다.',
    }),
  );
}

export async function mintTicket(ticketInfo) {
  return request(
    '/mint-ticket',
    {
      method: 'POST',
      body: JSON.stringify(ticketInfo),
    },
    () => ({
      tokenId: Math.floor(100000 + Math.random() * 900000).toString(),
      txHash: `0x${crypto.randomUUID().replaceAll('-', '')}`,
    }),
  );
}

export async function generateNonce() {
  return request(
    '/generate-nonce',
    { method: 'POST' },
    () => ({
      nonce: crypto.randomUUID().replaceAll('-', ''),
      expiresIn: 30,
    }),
  );
}

export async function getTicketsByWallet(walletAddress) {
  return request(
    `/tickets?walletAddress=${encodeURIComponent(walletAddress)}`,
    { method: 'GET' },
    () => ({
      walletAddress,
      tickets: mockTickets.map((ticket) => ({
        ...ticket,
        owner: walletAddress,
      })),
    }),
  );
}
