/**
 * blockchain.js — 스마트 컨트랙트 연동 서비스
 *
 * MOCK_BLOCKCHAIN=true  → B의 컨트랙트 없이 인메모리 mock으로 동작 (오늘 개발용)
 * MOCK_BLOCKCHAIN=false → ethers.js로 실제 컨트랙트 호출 (내일 B 주소/ABI 받으면 .env만 바꾸면 됨)
 *
 * .env에 필요한 값 (real 모드):
 *   RPC_URL, SERVER_PRIVATE_KEY,
 *   ISSUER_REGISTRY_ADDRESS, VC_REGISTRY_ADDRESS, TICKET_NFT_ADDRESS
 */
const { ethers } = require("ethers");

const MOCK = process.env.MOCK_BLOCKCHAIN !== "false"; // 기본값: mock

// ---------- 최소 ABI (B 컨트랙트 시그니처 기준, 내일 ABI 받으면 교체) ----------
const ISSUER_REGISTRY_ABI = [
  "function isTrusted(address issuer) view returns (bool)"
];
const VC_REGISTRY_ABI = [
  "function isValid(bytes32 vcHash) view returns (bool)",
  "function registerVC(bytes32 vcHash)"
];
const TICKET_NFT_ABI = [
  "function mintTicket(address to, string eventId, string seatId) returns (uint256)",
  "function useTicket(uint256 tokenId, uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[4] input)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event TicketMinted(address indexed to, uint256 indexed tokenId)"
];

// ---------- Mock 상태 (인메모리) ----------
const mockState = {
  trustedIssuers: new Set([(process.env.MOCK_TRUSTED_ISSUER || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266").toLowerCase()]),
  vcHashes: new Map(), // vcHash -> { valid: true }
  nextTokenId: 1,
  tickets: new Map()   // tokenId -> { owner, status }
};

// ---------- Real 모드 lazy init ----------
let provider, signer, issuerRegistry, vcRegistry, ticketNFT;
function initContracts() {
  if (provider) return;
  provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  signer = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY, provider);
  issuerRegistry = new ethers.Contract(process.env.ISSUER_REGISTRY_ADDRESS, ISSUER_REGISTRY_ABI, signer);
  vcRegistry = new ethers.Contract(process.env.VC_REGISTRY_ADDRESS, VC_REGISTRY_ABI, signer);
  ticketNFT = new ethers.Contract(process.env.TICKET_NFT_ADDRESS, TICKET_NFT_ABI, signer);
}

// ====================================================================
// 공개 API
// ====================================================================

exports.isMock = MOCK;

/** 신뢰 기관 여부 조회 (IssuerRegistry.isTrusted) */
exports.isTrustedIssuer = async (issuerAddress) => {
  if (MOCK) return mockState.trustedIssuers.has(issuerAddress.toLowerCase());
  initContracts();
  return issuerRegistry.isTrusted(issuerAddress);
};

/** VC 해시 유효성 조회 (VCRegistry.isValid) */
exports.isValidVC = async (vcHash) => {
  if (MOCK) return mockState.vcHashes.get(String(vcHash))?.valid === true;
  initContracts();
  return vcRegistry.isValid(toBytes32(vcHash));
};

/** VC 해시 등록 — C의 어드민(발급기관) 페이지가 사용 */
exports.registerVC = async (vcHash) => {
  if (MOCK) {
    mockState.vcHashes.set(String(vcHash), { valid: true });
    return { txHash: "0xmock_register_" + Date.now() };
  }
  initContracts();
  const tx = await vcRegistry.registerVC(toBytes32(vcHash));
  await tx.wait();
  return { txHash: tx.hash };
};

/** NFT 티켓 발행 → tokenId 반환 */
exports.mintTicketNFT = async (toAddress, eventId, seatId) => {
  if (MOCK) {
    const tokenId = mockState.nextTokenId++;
    mockState.tickets.set(String(tokenId), { owner: toAddress, status: "VALID" });
    return { tokenId: String(tokenId), txHash: "0xmock_mint_" + tokenId };
  }
  initContracts();
  const tx = await ticketNFT.mintTicket(toAddress, eventId, seatId);
  const receipt = await tx.wait();
  // TicketMinted 이벤트에서 tokenId 파싱
  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = ticketNFT.interface.parseLog(log);
      if (parsed?.name === "TicketMinted") tokenId = parsed.args.tokenId.toString();
    } catch (_) { /* 다른 컨트랙트 로그 무시 */ }
  }
  return { tokenId, txHash: tx.hash };
};

/** 티켓 사용 처리 (TicketNFT.useTicket) — verify-proof 성공 시 호출 */
exports.useTicketNFT = async (tokenId, proof, publicSignals) => {
  if (MOCK) {
    const t = mockState.tickets.get(String(tokenId));
    if (t && t.status !== "VALID") throw new Error("Ticket already used (on-chain mock)");
    if (t) t.status = "USED";
    return { txHash: "0xmock_use_" + tokenId };
  }
  initContracts();
  // snarkjs proof → solidity calldata 포맷 변환 (pi_b는 좌표 순서 반전 주의!)
  const a = [proof.pi_a[0], proof.pi_a[1]];
  const b = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]]
  ];
  const c = [proof.pi_c[0], proof.pi_c[1]];
  const tx = await ticketNFT.useTicket(tokenId, a, b, c, publicSignals);
  await tx.wait();
  return { txHash: tx.hash };
};

/** 보유 티켓 소유자 조회 */
exports.ownerOfTicket = async (tokenId) => {
  if (MOCK) return mockState.tickets.get(String(tokenId))?.owner || null;
  initContracts();
  return ticketNFT.ownerOf(tokenId);
};

// hex string(0x..) 또는 십진수 문자열 → bytes32
function toBytes32(v) {
  if (typeof v === "string" && v.startsWith("0x")) return ethers.zeroPadValue(v, 32);
  return ethers.toBeHex(BigInt(v), 32);
}
