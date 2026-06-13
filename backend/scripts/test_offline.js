/**
 * test_offline.js — MongoDB 없이 핵심 로직만 검증하는 테스트
 *  1. Poseidon 해시 (서버/회로 일치 여부)
 *  2. proof 생성 → verification_key.json으로 검증
 *  3. 잘못된 publicSignal 변조 시 검증 실패하는지
 *  4. 미성년자 birthdate로 witness 생성 실패하는지
 *  5. ethers.verifyMessage 기반 VP 서명 검증
 */
process.env.MOCK_BLOCKCHAIN = "true";
const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");
const zkp = require("../src/services/zkp");

const WASM = path.join(__dirname, "../circuits/build/ticket_verify_js/ticket_verify.wasm");
const ZKEY = path.join(__dirname, "../circuits/build/ticket_verify_final.zkey");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}

async function main() {
  console.log("[1] proof 생성 (성인, 정상 케이스)");
  const nonceHex = crypto.randomBytes(16).toString("hex");
  const tokenId = "1", birthdate = "20030415", vcSecret = "987654321";
  const tokenIdHash = await zkp.poseidonHash([tokenId]);
  const vcHash = await zkp.poseidonHash([birthdate, vcSecret]);
  const input = {
    birthdate, tokenId, vcSecret,
    nonce: BigInt("0x" + nonceHex).toString(),
    currentDate: String(zkp.todayYYYYMMDD()),
    tokenIdHash, vcHash
  };
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`  proof 생성 시간: ${Date.now() - t0}ms`);

  check("groth16.verify == true", await zkp.verifyProof(proof, publicSignals));
  check("publicSignals[0] == nonce", BigInt(publicSignals[0]) === BigInt("0x" + nonceHex));
  check("publicSignals[2] == Poseidon(tokenId)", publicSignals[2] === tokenIdHash);

  console.log("[2] publicSignal 변조 시 검증 실패");
  const tampered = [...publicSignals];
  tampered[2] = await zkp.poseidonHash(["999"]); // 다른 티켓의 해시로 변조
  check("변조된 signals → verify == false", !(await zkp.verifyProof(proof, tampered)));

  console.log("[3] 미성년자 birthdate → witness 생성 실패해야 함");
  let minorFailed = false;
  try {
    const minorBirth = String(zkp.todayYYYYMMDD() - 100000); // 만 10세
    const vcHash2 = await zkp.poseidonHash([minorBirth, vcSecret]);
    await snarkjs.groth16.fullProve(
      { ...input, birthdate: minorBirth, vcHash: vcHash2 }, WASM, ZKEY
    );
  } catch (e) { minorFailed = true; }
  check("미성년자 proof 생성 → 실패", minorFailed);

  console.log("[4] VP 전자서명 검증 (ethers.verifyMessage)");
  const wallet = ethers.Wallet.createRandom();
  const vp = {
    holder: wallet.address,
    did: "did:qrush:user-test",
    issuer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    vcHash,
    claims: { name: "홍길동", age: 23 }
  };
  const sig = await wallet.signMessage(JSON.stringify(vp));
  check("서명자 == holder", ethers.verifyMessage(JSON.stringify(vp), sig) === wallet.address);
  const other = ethers.Wallet.createRandom();
  const badSig = await other.signMessage(JSON.stringify(vp));
  check("다른 지갑 서명 → 불일치", ethers.verifyMessage(JSON.stringify(vp), badSig) !== wallet.address);

  console.log("[5] mock blockchain 서비스");
  const bc = require("../src/services/blockchain");
  await bc.registerVC(vcHash);
  check("registerVC → isValidVC true", await bc.isValidVC(vcHash));
  check("미등록 vcHash → false", !(await bc.isValidVC("123456")));
  const m = await bc.mintTicketNFT("0xabc", "ev1", "A-1");
  check("mintTicketNFT → tokenId 반환", !!m.tokenId);
  await bc.useTicketNFT(m.tokenId, proof, publicSignals);
  let reuse = false;
  try { await bc.useTicketNFT(m.tokenId, proof, publicSignals); } catch (e) { reuse = true; }
  check("이미 사용된 티켓 재사용 → 실패", reuse);

  console.log(`\n결과: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
