/**
 * generate_proof_sample.js — D 앱 참고용 proof 생성 예제
 *
 * 실행: node scripts/generate_proof_sample.js <nonceHex> <tokenId> <birthdate> <vcSecret>
 * 예:   node scripts/generate_proof_sample.js a1b2... 1 20030415 12345
 *
 * D 앱에서는 같은 로직을 snarkjs.groth16.fullProve()로 수행하면 됨.
 * 필요한 파일 (A → D 전달):
 *   circuits/build/ticket_verify_js/ticket_verify.wasm
 *   circuits/build/ticket_verify_final.zkey
 */
const path = require("path");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const WASM = path.join(__dirname, "../circuits/build/ticket_verify_js/ticket_verify.wasm");
const ZKEY = path.join(__dirname, "../circuits/build/ticket_verify_final.zkey");

function todayYYYYMMDD() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  const [nonceHex, tokenId, birthdate, vcSecret] = process.argv.slice(2);
  if (!nonceHex) {
    console.error("usage: node generate_proof_sample.js <nonceHex> <tokenId> <birthdate> <vcSecret>");
    process.exit(1);
  }

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const tokenIdHash = F.toString(poseidon([BigInt(tokenId)]));
  const vcHash = F.toString(poseidon([BigInt(birthdate), BigInt(vcSecret)]));

  const input = {
    // private
    birthdate: birthdate,
    tokenId: tokenId,
    vcSecret: vcSecret,
    // public
    nonce: BigInt("0x" + nonceHex).toString(),
    currentDate: todayYYYYMMDD(),
    tokenIdHash,
    vcHash
  };

  console.error("input:", input);
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.error(`proof generated in ${Date.now() - t0}ms`);

  // verify-proof API에 그대로 POST할 수 있는 body 출력
  console.log(JSON.stringify({ proof, publicSignals, nonce: nonceHex, tokenId }, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
