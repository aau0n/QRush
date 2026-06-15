/**
 * blockchain.js — 스마트 컨트랙트 연동 서비스 (B 실제 시그니처 정렬판)
 *
 * MOCK_BLOCKCHAIN=true  → mock 인메모리 (오늘/병렬 개발용)
 * MOCK_BLOCKCHAIN=false → ethers.js 실제 호출
 *
 * B 컨트랙트 실제 함수 (blockchain/contracts 기준):
 *   IssuerRegistry.isTrustedIssuer(address) view → bool
 *   VCRegistry.registerVC(bytes32) / isValidVC(bytes32) view → bool
 *   TicketNFT.mintTicket(address,uint256,uint256) → uint256
 *   TicketNFT.registerNonce(uint256)  [onlyOwner]
 *   TicketNFT.useTicket(uint256 tokenId, uint256 nonce, bytes32 vcHash, uint256 currentDate, uint[2] pA, uint[2][2] pB, uint[2] pC)
 *   TicketNFT.getTicket(uint256) / ownerOf(uint256)
 */
const { ethers } = require("ethers");

const MOCK = process.env.MOCK_BLOCKCHAIN !== "false";

const ISSUER_REGISTRY_ABI = [
  "function isTrustedIssuer(address issuer) view returns (bool)"
];
const VC_REGISTRY_ABI = [
  "function isValidVC(bytes32 vcHash) view returns (bool)",
  "function registerVC(bytes32 vcHash)"
];
const TICKET_NFT_ABI = [
  "function mintTicket(address to, uint256 eventId, uint256 seatId) returns (uint256)",
  "function registerNonce(uint256 nonce)",
  "function useTicket(uint256 tokenId, uint256 nonce, bytes32 vcHash, uint256 currentDate, uint256[2] pA, uint256[2][2] pB, uint256[2] pC)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 eventId, uint256 seatId)"
];

const mockState = {
  trustedIssuers: new Set([(process.env.MOCK_TRUSTED_ISSUER || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266").toLowerCase()]),
  vcHashes: new Map(),
  registeredNonces: new Map(), // nonce(string) -> createdAt(ms)
  usedNonces: new Set(),
  nextTokenId: 1,
  tickets: new Map()
};

let provider, signer, issuerRegistry, vcRegistry, ticketNFT;
function initContracts() {
  if (provider && signer && issuerRegistry && vcRegistry && ticketNFT) return;

  const required = [
    "SERVER_PRIVATE_KEY",
    "ISSUER_REGISTRY_ADDRESS",
    "VC_REGISTRY_ADDRESS",
    "TICKET_NFT_ADDRESS",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing blockchain env: ${missing.join(", ")}`);
  }

  const nextProvider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  const nextSigner = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, nextProvider);
  const nextIssuerRegistry = new ethers.Contract(process.env.ISSUER_REGISTRY_ADDRESS, ISSUER_REGISTRY_ABI, nextSigner);
  const nextVcRegistry = new ethers.Contract(process.env.VC_REGISTRY_ADDRESS, VC_REGISTRY_ABI, nextSigner);
  const nextTicketNFT = new ethers.Contract(process.env.TICKET_NFT_ADDRESS, TICKET_NFT_ABI, nextSigner);

  provider = nextProvider;
  signer = nextSigner;
  issuerRegistry = nextIssuerRegistry;
  vcRegistry = nextVcRegistry;
  ticketNFT = nextTicketNFT;
}

/** Hardhat localhost: getTransactionCount can lag behind the account nonce. */
let nextNonce = null;

function isNonceError(err) {
  const msg = err?.info?.error?.message || err?.message || "";
  return err?.code === "NONCE_EXPIRED" || msg.includes("Nonce too low") || msg.includes("Nonce too high");
}

function syncNonceFromError(err) {
  const msg = err?.info?.error?.message || err?.message || "";
  const match = msg.match(/Expected nonce to be (\d+)/);
  if (match) nextNonce = parseInt(match[1], 10);
}

async function nextTxOverrides() {
  initContracts();
  if (nextNonce === null) {
    nextNonce = await provider.getTransactionCount(signer.address, "latest");
  }
  return { nonce: nextNonce++ };
}

async function sendAndWait(sendTx) {
  initContracts();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const tx = await sendTx(await nextTxOverrides());
      return tx.wait();
    } catch (err) {
      if (!isNonceError(err) || attempt === 4) throw err;
      syncNonceFromError(err);
      nextNonce = null;
    }
  }
}

exports.isMock = MOCK;

exports.isTrustedIssuer = async (issuerAddress) => {
  if (MOCK) return mockState.trustedIssuers.has(String(issuerAddress).toLowerCase());
  initContracts();
  return issuerRegistry.isTrustedIssuer(issuerAddress);
};

exports.isValidVC = async (vcHash) => {
  if (MOCK) return mockState.vcHashes.get(String(vcHash))?.valid === true;
  initContracts();
  return vcRegistry.isValidVC(toBytes32(vcHash));
};

exports.registerVC = async (vcHash) => {
  if (MOCK) {
    mockState.vcHashes.set(String(vcHash), { valid: true });
    return { txHash: "0xmock_register_" + Date.now() };
  }
  initContracts();
  const receipt = await sendAndWait((overrides) => vcRegistry.registerVC(toBytes32(vcHash), overrides));
  return { txHash: receipt.hash };
};

/** C mock id(match-001) / 좌석(A1) → 컨트랙트 uint256 */
function toChainUint256(value, label = "value") {
  const raw = String(value).trim();
  if (!raw) throw new Error(`${label} is required`);

  if (/^\d+$/.test(raw)) return BigInt(raw);

  const eventMatch = raw.match(/^match-(\d+)$/i);
  if (eventMatch) return BigInt(eventMatch[1]);

  const seatMatch = raw.match(/^([A-Za-z])(\d+)$/);
  if (seatMatch) {
    const row = seatMatch[1].toUpperCase().charCodeAt(0) - 64;
    const col = Number(seatMatch[2]);
    if (row < 1 || col < 1) throw new Error(`Invalid seat id: ${raw}`);
    return BigInt(row * 1000 + col);
  }

  throw new Error(`Cannot convert ${raw} to uint256 for ${label}`);
}

exports.mintTicketNFT = async (toAddress, eventId, seatId) => {
  if (MOCK) {
    const tokenId = mockState.nextTokenId++;
    mockState.tickets.set(String(tokenId), { owner: toAddress, status: "VALID" });
    return { tokenId: String(tokenId), txHash: "0xmock_mint_" + tokenId };
  }
  initContracts();
  const chainEventId = toChainUint256(eventId, "eventId");
  const chainSeatId = toChainUint256(seatId, "seatId");
  const receipt = await sendAndWait((overrides) =>
    ticketNFT.mintTicket(toAddress, chainEventId, chainSeatId, overrides)
  );
  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = ticketNFT.interface.parseLog(log);
      if (parsed?.name === "TicketMinted") tokenId = parsed.args.tokenId.toString();
    } catch (_) {}
  }
  return { tokenId, txHash: receipt.hash };
};

/** 게이트가 nonce를 체인에 등록 (B의 registerNonce, onlyOwner) */
exports.registerNonce = async (nonceField) => {
  if (MOCK) {
    mockState.registeredNonces.set(String(nonceField), Date.now());
    return { txHash: "0xmock_nonce_" + Date.now() };
  }
  initContracts();
  const receipt = await sendAndWait((overrides) => ticketNFT.registerNonce(BigInt(nonceField), overrides));
  return { txHash: receipt.hash };
};

/**
 * 티켓 사용 (B의 useTicket)
 * v2 pubSignals order is [isAdult, vcHash, nonce, tokenId, currentDate].
 */
exports.useTicketNFT = async (tokenId, nonceField, vcHash, currentDate, proof) => {
  if (MOCK) {
    const created = mockState.registeredNonces.get(String(nonceField));
    if (!created) throw new Error("Nonce not registered on-chain (mock)");
    if (mockState.usedNonces.has(String(nonceField))) throw new Error("Nonce already used (mock)");
    const t = mockState.tickets.get(String(tokenId));
    if (t && t.status !== "VALID") throw new Error("Ticket not valid (mock)");
    mockState.usedNonces.add(String(nonceField));
    if (t) t.status = "USED";
    return { txHash: "0xmock_use_" + tokenId };
  }
  initContracts();
  // snarkjs proof → solidity calldata (pi_b 좌표 순서 반전 주의)
  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]]
  ];
  const pC = [proof.pi_c[0], proof.pi_c[1]];
  const receipt = await sendAndWait((overrides) =>
    ticketNFT.useTicket(tokenId, BigInt(nonceField), toBytes32(vcHash), BigInt(currentDate), pA, pB, pC, overrides)
  );
  return { txHash: receipt.hash };
};

exports.ownerOfTicket = async (tokenId) => {
  if (MOCK) return mockState.tickets.get(String(tokenId))?.owner || null;
  initContracts();
  return ticketNFT.ownerOf(tokenId);
};

function toBytes32(v) {
  if (typeof v === "string" && v.startsWith("0x")) return ethers.zeroPadValue(v, 32);
  return ethers.toBeHex(BigInt(v), 32);
}
