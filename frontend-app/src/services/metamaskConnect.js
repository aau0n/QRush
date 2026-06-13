import { createEVMClient } from '@metamask/connect-evm';

let clientPromise = null;

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
    });
  }

  return clientPromise;
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
