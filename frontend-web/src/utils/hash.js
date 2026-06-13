import { poseidon2 } from 'poseidon-lite';

export function toYyyymmdd(dateString) {
  if (!dateString) return 0;
  return Number(dateString.replaceAll('-', ''));
}

export function randomVcSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(31)); // 248bit < BN254 field
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value.toString();
}

export function randomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function computeVcHash(birthdateYyyymmdd, vcSecret) {
  return poseidon2([BigInt(birthdateYyyymmdd), BigInt(vcSecret)]).toString();
}

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
