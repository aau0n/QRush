import { poseidon2 } from 'poseidon-lite';

// ── vcHash 정의 (팀 전체 합의 항목, HANDOFF.md) ───────────────────────────
// vcHash = Poseidon(birthdate, vcSecret)
//   birthdate : YYYYMMDD 정수 (예: 20030415)
//   vcSecret  : VC 발급 시 발급기관(C 어드민)이 생성하는 랜덤 salt(field 원소)
// C(등록)·D(proof)·체인이 똑같은 값을 써야 입장이 성공한다.
// poseidon-lite는 D의 circomlibjs / 회로 Poseidon과 동일한 BN254 출력(검증됨).
// 결과는 십진 문자열로 반환 — A의 register-vc가 십진 문자열을 받는다.

// "YYYY-MM-DD" → 20030415 (정수)
export function toYyyymmdd(dateString) {
  if (!dateString) return 0;
  return Number(dateString.replaceAll('-', ''));
}

// BN254 field( < 2^254 )에 안전한 랜덤 secret 생성 → 십진 문자열
export function randomVcSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(31)); // 248bit < field
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value.toString();
}

// vcHash = Poseidon(birthdate, vcSecret) → 십진 문자열
export function computeVcHash(birthdateYyyymmdd, vcSecret) {
  return poseidon2([BigInt(birthdateYyyymmdd), BigInt(vcSecret)]).toString();
}

// ── 기존 유틸 (JSON 직렬화/표시용) ─────────────────────────────────────────
export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function stableJson(value) {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortKeys(value[key]);
      return result;
    }, {});
}
