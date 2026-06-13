/**
 * zkp.js — Groth16 proof 검증 서비스
 *
 * publicSignals 순서 (회로 정의 기준):
 *   [0] nonce
 *   [1] currentDate (YYYYMMDD)
 *   [2] tokenIdHash = Poseidon(tokenId)
 *   [3] vcHash      = Poseidon(birthdate, vcSecret)
 */
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const VKEY_PATH = path.join(__dirname, "../../circuits/build/verification_key.json");
let vKey = null;
let poseidon = null;

function getVKey() {
  if (!vKey) vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
  return vKey;
}

async function getPoseidon() {
  if (!poseidon) poseidon = await buildPoseidon();
  return poseidon;
}

/** Groth16 proof 검증 → boolean */
exports.verifyProof = async (proof, publicSignals) => {
  return snarkjs.groth16.verify(getVKey(), publicSignals, proof);
};

/** Poseidon 해시 (서버에서 tokenIdHash / vcHash 재계산용) → 십진수 문자열 */
exports.poseidonHash = async (inputs) => {
  const p = await getPoseidon();
  return p.F.toString(p(inputs.map((x) => BigInt(x))));
};

/** publicSignals 파싱 헬퍼 */
exports.parsePublicSignals = (publicSignals) => ({
  nonce: publicSignals[0],
  currentDate: publicSignals[1],
  tokenIdHash: publicSignals[2],
  vcHash: publicSignals[3]
});

/** 오늘 날짜 YYYYMMDD (KST) */
exports.todayYYYYMMDD = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
  return Number(
    `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`
  );
};
