import { createEVMClient } from '@metamask/connect-evm';

export const METAMASK_SIGN_CHAIN_ID = '0x1';
export const CONNECTED_METAMASK_ACCOUNT_KEY = 'qrush_connected_metamask_account';

const METAMASK_MAINNET_RPC = 'https://cloudflare-eth.com';

let evmClientPromise = null;

export function getConnectedMetaMaskAccount() {
  return localStorage.getItem(CONNECTED_METAMASK_ACCOUNT_KEY) || '';
}

export function setConnectedMetaMaskAccount(account) {
  if (account) {
    localStorage.setItem(CONNECTED_METAMASK_ACCOUNT_KEY, account);
  } else {
    localStorage.removeItem(CONNECTED_METAMASK_ACCOUNT_KEY);
  }
}

export function getMetaMaskClient(eventHandlers = {}) {
  if (!evmClientPromise) {
    evmClientPromise = createEVMClient({
      dapp: {
        name: 'QRush Demo Wallet',
        url: window.location.href,
      },
      api: {
        supportedNetworks: {
          [METAMASK_SIGN_CHAIN_ID]: METAMASK_MAINNET_RPC,
        },
      },
      analytics: {
        enabled: false,
      },
      eventHandlers: {
        connect: ({ accounts }) => {
          if (accounts?.[0]) setConnectedMetaMaskAccount(accounts[0]);
          eventHandlers.connect?.({ accounts });
        },
        connectWith: eventHandlers.connectWith,
        connectAndSign: eventHandlers.connectAndSign,
      },
    });
  }

  return evmClientPromise;
}

export async function connectMetaMaskAccount() {
  const client = await getMetaMaskClient();
  const { accounts } = await client.connect({
    chainIds: [METAMASK_SIGN_CHAIN_ID],
    forceRequest: true,
  });
  const account = accounts[0];

  if (!account) throw new Error('MetaMask 계정을 가져오지 못했습니다.');

  setConnectedMetaMaskAccount(account);
  return account;
}
