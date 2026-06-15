import * as snarkjs from 'snarkjs';

const WASM_PATH = '/zkp/ticket_verify.wasm';
const ZKEY_PATH = '/zkp/ticket_verify_final.zkey';

function toFieldString(value, label) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${label} is required.`);
  }

  try {
    const normalized = BigInt(value).toString();
    if (normalized.startsWith('-')) {
      throw new Error();
    }
    return normalized;
  } catch {
    throw new Error(`${label} must be a field decimal string.`);
  }
}

export function todayYYYYMMDD() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function normalizeBirthdate(value) {
  const normalized = String(value || '').replaceAll('-', '').trim();

  if (!/^\d{8}$/.test(normalized)) {
    throw new Error('VC birthdate must be YYYYMMDD or YYYY-MM-DD.');
  }

  return normalized;
}

export function getBirthdateFromVc(savedVc) {
  return normalizeBirthdate(savedVc?.vc?.credentialSubject?.birthdate || savedVc?.birthdate);
}

export function getVcHashFromVc(savedVc) {
  return toFieldString(savedVc?.vcHash || savedVc?.vc?.vcHash || savedVc?.vc?.credentialSubject?.vcHash, 'vcHash');
}

// v3 본인 인증: vcSecret(VC 발급 시 받은 비밀값)을 proof private input으로 사용
export function getVcSecretFromVc(savedVc) {
  return toFieldString(savedVc?.vcSecret || savedVc?.vc?.vcSecret || savedVc?.vc?.credentialSubject?.vcSecret, 'vcSecret');
}

export function getNonceFromChallenge(challenge) {
  return toFieldString(challenge?.nonce, 'Gate nonce');
}

export async function buildEntryProofInput({ challenge, ticket, savedVc }) {
  return {
    birthdate: getBirthdateFromVc(savedVc),
    vcSecret: getVcSecretFromVc(savedVc),   // v3 본인 인증 (private)
    vcHash: getVcHashFromVc(savedVc),
    nonce: getNonceFromChallenge(challenge),
    tokenId: toFieldString(ticket?.tokenId, 'tokenId'),
    currentDate: todayYYYYMMDD(),
  };
}

export async function generateEntryProof({ challenge, ticket, savedVc }) {
  const input = await buildEntryProofInput({ challenge, ticket, savedVc });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);

  return {
    input,
    proof,
    publicSignals,
  };
}
