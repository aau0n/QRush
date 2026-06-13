/**
 * test_e2e.js — 로컬에서 서버 띄운 뒤 전체 플로우 HTTP 테스트
 *
 * 사전 조건: MongoDB 실행 중, 서버 실행 중 (npm run dev)
 * 실행:     node scripts/test_e2e.js
 *
 * 플로우: VC등록 → VP검증 → 티켓발행 → nonce발급 → proof생성 → 입장검증
 *        → ★재사용 공격 2종 (같은 nonce / 같은 티켓) 차단 확인
 */
const path = require("path");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");
const { buildPoseidon } = require("circomlibjs");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const WASM = path.join(__dirname, "../circuits/build/ticket_verify_js/ticket_verify.wasm");
const ZKEY = path.join(__dirname, "../circuits/build/ticket_verify_final.zkey");

const post = (url, body) =>
  fetch(BASE + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

function today() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  const poseidon = await buildPoseidon();
  const H = (arr) => poseidon.F.toString(poseidon(arr.map(BigInt)));

  // 0. 사용자 지갑 + VC 데이터 (D 앱 역할)
  const wallet = ethers.Wallet.createRandom();
  const birthdate = "20030415", vcSecret = "987654321";
  const vcHash = H([birthdate, vcSecret]);

  // 1. VC 등록 (C 어드민 역할)
  let r = await post("/api/vc/register-vc", { vcHash, issuer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" });
  console.log("1. register-vc:", r.status, r.body.success ? "OK" : r.body);

  // 2. VP 생성 + 서명 검증 (예매 플로우)
  const vp = { holder: wallet.address, did: "did:qrush:user-e2e", issuer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", vcHash, claims: { name: "테스트", age: 23 } };
  const signature = await wallet.signMessage(JSON.stringify(vp));
  r = await post("/api/vc/verify-vp", { vp, signature });
  console.log("2. verify-vp:", r.status, r.body.verified ? "OK" : r.body);

  // 3. 티켓 발행
  r = await post("/api/ticket/mint-ticket", { eventId: "ev-e2e-" + Date.now(), seatId: "A-1", buyerWallet: wallet.address });
  const tokenId = r.body.ticket?.tokenId;
  console.log("3. mint-ticket:", r.status, "tokenId =", tokenId);

  // 4. nonce 발급 (게이트 역할)
  r = await post("/api/gate/generate-nonce", {});
  const nonce = r.body.nonce;
  console.log("4. generate-nonce:", r.status, nonce?.slice(0, 12) + "...");

  // 5. proof 생성 (D 앱 역할)
  const input = {
    birthdate, tokenId, vcSecret,
    nonce: BigInt("0x" + nonce).toString(),
    currentDate: today(),
    tokenIdHash: H([tokenId]),
    vcHash
  };
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log("5. proof 생성:", Date.now() - t0 + "ms");

  // 6. 입장 검증 → 성공해야 함
  r = await post("/api/gate/verify-proof", { proof, publicSignals, nonce, tokenId });
  console.log("6. verify-proof:", r.status, r.body.entry ? "입장 허용 ✅" : r.body);

  // 7. 공격 1: 같은 nonce + 같은 proof 재전송 → 거부돼야 함
  r = await post("/api/gate/verify-proof", { proof, publicSignals, nonce, tokenId });
  console.log("7. nonce 재사용 공격:", r.status === 401 ? "차단 ✅" : "차단 실패 ❌ " + JSON.stringify(r.body));

  // 8. 공격 2: 새 nonce 받아서 새 proof를 만들어도, 이미 USED 티켓 → 거부돼야 함
  r = await post("/api/gate/generate-nonce", {});
  const nonce2 = r.body.nonce;
  const input2 = { ...input, nonce: BigInt("0x" + nonce2).toString() };
  const p2 = await snarkjs.groth16.fullProve(input2, WASM, ZKEY);
  r = await post("/api/gate/verify-proof", { proof: p2.proof, publicSignals: p2.publicSignals, nonce: nonce2, tokenId });
  console.log("8. 사용된 티켓 재입장 공격:", r.status === 401 ? "차단 ✅" : "차단 실패 ❌ " + JSON.stringify(r.body));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
