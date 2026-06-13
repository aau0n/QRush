/**
 * zkp.js — Groth16 proof 검증 서비스 (B 컨트랙트 규격 정렬판)
 *
 * snarkjs publicSignals 순서 (회로 output 먼저, 그 다음 public input 선언 순):
 *   [0] isAdult      (output)
 *   [1] vcHash
 *   [2] nonce
 *   [3] tokenId
 *   [4] currentDate
 *
 * B의 useTicket pubSignals 순서: [vcHash, nonce, tokenId, isAdult]
 *  → toContractPubSignals()로 변환해서 D/체인에 넘김
 */
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");

const VKEY_PATH = path.join(__dirname, "../../circuits/build/verification_key.json");
let vKey = null;

function getVKey() {
  if (!vKey) vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
  return vKey;
}

/** Groth16 proof 검증 → boolean */
exports.verifyProof = async (proof, publicSignals) => {
  return snarkjs.groth16.verify(getVKey(), publicSignals, proof);
};

/** snarkjs publicSignals(5개) 파싱 */
exports.parsePublicSignals = (publicSignals) => ({
  isAdult: publicSignals[0],
  vcHash: publicSignals[1],
  nonce: publicSignals[2],
  tokenId: publicSignals[3],
  currentDate: publicSignals[4]
});

/** 체인(useTicket) pubSignals 순서 [vcHash, nonce, tokenId, isAdult]로 변환 */
exports.toContractPubSignals = (publicSignals) => {
  const p = exports.parsePublicSignals(publicSignals);
  return [p.vcHash, p.nonce, p.tokenId, p.isAdult];
};

/** 오늘 날짜 YYYYMMDD (KST) */
exports.todayYYYYMMDD = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return Number(
    `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`
  );
};
