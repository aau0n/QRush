/**
 * generate_proof_sample.js — D 앱 참고용 proof 생성 예제 (v3 본인 인증)
 *
 * 실행: node scripts/generate_proof_sample.js <nonceField> <tokenId> <birthdate> <vcSecret>
 *   vcHash는 vcSecret으로부터 계산됨 (vcHash = Poseidon(birthdate, vcSecret))
 *
 * publicSignals 순서: [isAdult, vcHash, nonce, tokenId, currentDate]
 */
const path = require("path");
const snarkjs = require("snarkjs");
const { poseidon2 } = require("poseidon-lite");

const WASM = path.join(__dirname, "../circuits/build/ticket_verify_js/ticket_verify.wasm");
const ZKEY = path.join(__dirname, "../circuits/build/ticket_verify_final.zkey");

function todayYYYYMMDD() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  const [nonce, tokenId, birthdate, vcSecret] = process.argv.slice(2);
  if (!nonce) {
    console.error("usage: node generate_proof_sample.js <nonceField> <tokenId> <birthdate> <vcSecret>");
    process.exit(1);
  }
  const vcHash = poseidon2([BigInt(birthdate), BigInt(vcSecret)]).toString();
  const input = {
    birthdate,                  // private
    vcSecret,                   // private  ★본인 인증 비밀★
    vcHash,                     // public
    nonce,
    tokenId,
    currentDate: todayYYYYMMDD()
  };
  console.error("input:", input);
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.error(`proof generated in ${Date.now() - t0}ms`);
  console.log(JSON.stringify({ proof, publicSignals, nonce, tokenId, vcHash }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
