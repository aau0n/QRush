# QRush Integration Handoff v2

## ZKP v2 Public Signals

`snarkjs.groth16.fullProve()` returns exactly 5 public signals:

```text
[0] isAdult
[1] vcHash
[2] nonce
[3] tokenId
[4] currentDate
```

Do not reorder, slice, or convert this array to 4 values.

`TicketNFT.useTicket` must build/use the same `uint[5]` order:

```text
[isAdult, vcHash, nonce, tokenId, currentDate]
```

`ZKPVerifier` must pass that `uint[5]` directly to `groth16.verifyProof(...)`.
It may additionally require `pubSignals[0] == 1`.

## D App Proof Input

```js
const input = {
  birthdate: "20030415",     // private, YYYYMMDD
  vcHash: "<field decimal>", // public
  nonce: "<field decimal>",  // generate-nonce response nonce
  tokenId: "1",
  currentDate: "20260613"
};

const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
```

`vcHash` is not recomputed inside the circuit. C, D, backend, and chain must use the same BN254-field-safe decimal string.

## Gate APIs

### POST `/api/gate/generate-nonce`

Returns the QR payload C displays and D parses:

```json
{
  "type": "QRushGateChallenge",
  "nonce": "field decimal",
  "nonceHex": "hex reference",
  "endpoint": "/api/gate/verify-proof",
  "expiresIn": 30,
  "chainTx": "0x..."
}
```

D uses `nonce`, not `nonceHex`, as the circuit input.

### POST `/api/gate/verify-proof`

D sends:

```json
{
  "proof": {},
  "publicSignals": ["isAdult", "vcHash", "nonce", "tokenId", "currentDate"],
  "nonce": "field decimal",
  "tokenId": "1",
  "vcHash": "field decimal"
}
```

## VP API

### POST `/api/vc/verify-vp`

```json
{
  "vp": {
    "holder": "0x...",
    "did": "did:qrush:...",
    "issuer": "0x...",
    "vcHash": "field decimal",
    "claims": { "name": "...", "age": 23 }
  },
  "signature": "0x..."
}
```

Signature input is exactly:

```js
wallet.signMessage(JSON.stringify(vp))
```

Keep the VP key insertion order as shown above.

## Files for D

- `circuits/build/ticket_verify_js/ticket_verify.wasm`
- `circuits/build/ticket_verify_final.zkey`
- `scripts/generate_proof_sample.js`

## vcHash Agreement

`vcHash` must be less than the BN254 field modulus. Do not use an unchecked full 32-byte keccak value if it can exceed the field. Use one shared representation across C, D, backend, and chain, such as 15-byte truncation or modulo field reduction.
