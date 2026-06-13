import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

const WASM_PATH = '/zkp/ticket_verify.wasm';
const ZKEY_PATH = '/zkp/ticket_verify_final.zkey';

let poseidonPromise = null;

function getPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }
  return poseidonPromise;
}

function toFieldString(value) {
  if (value === null || value === undefined || value === '') {
    throw new Error('ZKP input value is missing.');
  }

  return BigInt(value).toString();
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

export function nonceHexToField(nonceHex) {
  const cleanNonce = String(nonceHex || '')
    .trim()
    .replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]+$/.test(cleanNonce)) {
    throw new Error('Gate nonce must be a hex string.');
  }

  return BigInt(`0x${cleanNonce}`).toString();
}

export function getBirthdateFromVc(savedVc) {
  return normalizeBirthdate(savedVc?.vc?.credentialSubject?.birthdate || savedVc?.birthdate);
}

export function getVcSecret(savedVc) {
  return (
    savedVc?.vcSecret ||
    savedVc?.vc?.vcSecret ||
    savedVc?.vc?.credentialSubject?.vcSecret ||
    savedVc?.vc?.credentialSubject?.vc_secret ||
    savedVc?.vc?.credentialSubject?.salt ||
    null
  );
}

export async function poseidonHash(values) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  return F.toString(poseidon(values.map((value) => BigInt(toFieldString(value)))));
}

export async function buildEntryProofInput({ challenge, ticket, savedVc }) {
  const birthdate = getBirthdateFromVc(savedVc);
  const vcSecret = getVcSecret(savedVc);

  if (!vcSecret) {
    throw new Error('VC payload needs vcSecret to generate the entry proof.');
  }

  const tokenId = String(ticket.tokenId);
  const tokenIdHash = await poseidonHash([tokenId]);
  const vcHash = await poseidonHash([birthdate, vcSecret]);

  if (savedVc?.vcHash && String(savedVc.vcHash) !== vcHash) {
    throw new Error('Saved vcHash does not match Poseidon(birthdate, vcSecret).');
  }

  return {
    birthdate,
    tokenId,
    vcSecret: toFieldString(vcSecret),
    nonce: nonceHexToField(challenge.nonce),
    currentDate: todayYYYYMMDD(),
    tokenIdHash,
    vcHash,
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
