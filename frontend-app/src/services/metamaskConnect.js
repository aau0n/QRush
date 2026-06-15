import { createEVMClient } from '@metamask/connect-evm';

let clientPromise = null;
const CONNECT_SIGN_RESULT_KEY = 'qrush_metamask_connect_sign_result';
const CONNECT_SIGN_EVENT = 'qrush:metamask-connect-sign';

function getDappUrl() {
  if (typeof window === 'undefined') return 'http://localhost:5174';
  return window.location.origin;
}

export function getMetaMaskConnectClient() {
  if (!clientPromise) {
    clientPromise = createEVMClient({
      dapp: {
        name: 'QRush app',
        url: getDappUrl(),
      },
      api: {
        supportedNetworks: {
          '0x1': 'https://cloudflare-eth.com',
        },
      },
      analytics: {
        enabled: false,
      },
      eventHandlers: {
        connectAndSign: (result) => {
          saveConnectSignResult(result);
        },
      },
    });
  }

  return clientPromise;
}

function saveConnectSignResult(result) {
  if (!result?.signature) return;

  const payload = {
    accounts: Array.from(result.accounts || []),
    chainId: result.chainId,
    signature: result.signature,
    receivedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(CONNECT_SIGN_RESULT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures; the in-page event below can still carry the result.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONNECT_SIGN_EVENT, { detail: payload }));
  }
}

export function consumeMetaMaskConnectSignResult() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CONNECT_SIGN_RESULT_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(CONNECT_SIGN_RESULT_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function onMetaMaskConnectSignResult(handler) {
  if (typeof window === 'undefined') return () => {};

  const listener = (event) => handler(event.detail);
  window.addEventListener(CONNECT_SIGN_EVENT, listener);
  return () => window.removeEventListener(CONNECT_SIGN_EVENT, listener);
}

export async function connectMetaMaskAccount() {
  const client = await getMetaMaskConnectClient();
  const { accounts } = await client.connect({ chainIds: ['0x1'] });
  return accounts[0] || '';
}

export async function signMessageWithMetaMaskConnect(message) {
  const client = await getMetaMaskConnectClient();
  const { accounts, signature } = await client.connectAndSign({
    message,
    chainIds: ['0x1'],
  });

  return {
    address: accounts[0] || '',
    signature,
  };
}
