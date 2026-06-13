/**
 * test_e2e.js — 서버 띄운 뒤 전체 플로우 HTTP 테스트 (B 규격 정렬판)
 * 사전: MongoDB 실행, npm run dev 실행
 * 실행: node scripts/test_e2e.js
 */
const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");

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
  const wallet = ethers.Wallet.createRandom();
  const birthdate = "20030415";
  const vcHash = BigInt("0x" + crypto.randomBytes(15).toString("hex")).toString();
  const ISSUER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  let r = await post("/api/vc/register-vc", { vcHash, issuer: ISSUER });
  console.log("1. register-vc:", r.status, r.body.success ? "OK" : r.body);

  const vp = { holder: wallet.address, did: "did:qrush:e2e", issuer: ISSUER, vcHash, claims: { name: "테스트", age: 23 } };
  const signature = await wallet.signMessage(JSON.stringify(vp));
  r = await post("/api/vc/verify-vp", { vp, signature });
  console.log("2. verify-vp:", r.status, r.body.verified ? "OK" : r.body);

  r = await post("/api/ticket/mint-ticket", { eventId: "1", seatId: "1", buyerWallet: wallet.address });
  const tokenId = r.body.ticket?.tokenId;
  console.log("3. mint-ticket:", r.status, "tokenId =", tokenId);

  r = await post("/api/gate/generate-nonce", {});
  const nonce = r.body.nonce;
  console.log("4. generate-nonce:", r.status, "nonce(field) =", nonce?.slice(0, 12) + "...");

  const input = { birthdate, vcHash, nonce, tokenId, currentDate: today() };
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log("5. proof 생성:", Date.now() - t0 + "ms");

  r = await post("/api/gate/verify-proof", { proof, publicSignals, nonce, tokenId, vcHash });
  console.log("6. verify-proof:", r.status, r.body.entry ? "입장 허용 ✅" : r.body);

  r = await post("/api/gate/verify-proof", { proof, publicSignals, nonce, tokenId, vcHash });
  console.log("7. nonce 재사용 공격:", r.status === 401 ? "차단 ✅" : "실패 ❌ " + JSON.stringify(r.body));

  r = await post("/api/gate/generate-nonce", {});
  const nonce2 = r.body.nonce;
  const p2 = await snarkjs.groth16.fullProve({ ...input, nonce: nonce2 }, WASM, ZKEY);
  r = await post("/api/gate/verify-proof", { proof: p2.proof, publicSignals: p2.publicSignals, nonce: nonce2, tokenId, vcHash });
  console.log("8. 사용된 티켓 재입장:", r.status === 401 ? "차단 ✅" : "실패 ❌ " + JSON.stringify(r.body));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
