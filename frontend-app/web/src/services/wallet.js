export async function connectMetaMask() {
  if (!window.ethereum) {
    throw new Error("MetaMask가 설치되어 있지 않습니다.");
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  const chainId = await window.ethereum.request({
    method: "eth_chainId",
  });

  return {
    address: accounts?.[0] ?? null,
    chainId,
  };
}

export function shortenAddress(address) {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}