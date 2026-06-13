export function randomHex(bytes = 16) {
  const buffer = new Uint8Array(bytes);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomTxHash() {
  return `0xmock${randomHex(16)}`;
}
