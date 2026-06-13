process.env.MOCK_BLOCKCHAIN = "true";
const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");
const zkp = require("../src/services/zkp");

const WASM = path.join(__dirname, "../circuits/build/ticket_verify_js/ticket_verify.wasm");
const ZKEY = path.join(__dirname, "../circuits/build/ticket_verify_final.zkey");

let pass = 0, fail = 0;
const check = (n, c) => { c ? (pass++, console.log("  ✅", n)) : (fail++, console.log("  ❌", n)); };

async function main() {
  console.log("[1] proof 생성 (성인, 정상)");
  const nonce = BigInt("0x" + crypto.randomBytes(16).toString("hex")).toString();
  const tokenId = "1", birthdate = "20030415";
  const vcHash = BigInt("0x" + crypto.randomBytes(15).toString("hex")).toString(); // field 안전
  const input = { birthdate, vcHash, nonce, tokenId, currentDate: String(zkp.todayYYYYMMDD()) };
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`  생성 시간: ${Date.now() - t0}ms, signals=${publicSignals.length}개`);

  const ps = zkp.parsePublicSignals(publicSignals);
  check("groth16.verify == true", await zkp.verifyProof(proof, publicSignals));
  check("isAdult == 1", String(ps.isAdult) === "1");
  check("publicSignals[2] == nonce", BigInt(ps.nonce) === BigInt(nonce));
  check("publicSignals[3] == tokenId", BigInt(ps.tokenId) === BigInt(tokenId));
  check("toContractPubSignals 순서 [vcHash,nonce,tokenId,isAdult]",
    JSON.stringify(zkp.toContractPubSignals(publicSignals)) === JSON.stringify([ps.vcHash, ps.nonce, ps.tokenId, ps.isAdult]));

  console.log("[2] 변조 시 검증 실패");
  const tampered = [...publicSignals]; tampered[3] = "999";
  check("tokenId 변조 → verify false", !(await zkp.verifyProof(proof, tampered)));

  console.log("[3] 미성년자 → proof 생성 실패");
  let minorFail = false;
  try {
    const minor = String(zkp.todayYYYYMMDD() - 100000);
    await snarkjs.groth16.fullProve({ ...input, birthdate: minor }, WASM, ZKEY);
  } catch (e) { minorFail = true; }
  check("미성년자 proof → 실패", minorFail);

  console.log("[4] VP 서명 검증");
  const w = ethers.Wallet.createRandom();
  const vp = { holder: w.address, did: "did:qrush:t", issuer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", vcHash, claims: { name: "x", age: 23 } };
  const sig = await w.signMessage(JSON.stringify(vp));
  check("서명자 == holder", ethers.verifyMessage(JSON.stringify(vp), sig) === w.address);

  console.log("[5] mock 체인 (nonce 등록/사용/재사용)");
  const bc = require("../src/services/blockchain");
  await bc.registerVC(vcHash);
  check("registerVC → isValidVC true", await bc.isValidVC(vcHash));
  const m = await bc.mintTicketNFT("0xabc", "1", "1");
  await bc.registerNonce(nonce);
  await bc.useTicketNFT(m.tokenId, nonce, vcHash, proof);
  let reuse = false;
  try { await bc.useTicketNFT(m.tokenId, nonce, vcHash, proof); } catch (e) { reuse = true; }
  check("같은 nonce 재사용 → 실패", reuse);

  console.log(`\n결과: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
