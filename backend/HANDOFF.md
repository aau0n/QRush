# QRush Backend — 연동 가이드 v2 (A → B/C/D)

> ⚠️ v1 대비 ZKP 규격이 **B 컨트랙트에 맞춰 변경**됨. 아래 "달라진 점" 필독.

## 달라진 점 (v1 → v2)
- publicSignals 순서를 B의 `useTicket` pubSignals에 맞춤
- vcHash는 회로에서 Poseidon 해싱하지 않고 **그대로 통과**(체인 isValidVC가 검증)
- nonce는 hex가 아니라 **field(십진수)** 로 통일
- generate-nonce가 체인 `registerNonce()`도 호출

## publicSignals 순서 (★가장 중요)
snarkjs `fullProve` 결과 publicSignals (5개):
```
[0] isAdult      (회로 output)
[1] vcHash
[2] nonce
[3] tokenId
[4] currentDate
```
B의 `useTicket`이 만드는 pubSignals (4개): `[vcHash, nonce, tokenId, isAdult]`

→ **B 주의**: A의 verifier.sol은 `uint[5]`를 받음 (output 포함).
   B의 ZKPVerifier가 `useTicket`에서 `uint[4]`만 넘기면 검증 실패함.
   verifier에 넘길 때 순서는 `[isAdult, vcHash, nonce, tokenId, currentDate]`.
   → 내일 A·B 5분 회의로 verifier 래퍼 시그니처 맞출 것.

## 전달 파일
| 받는 사람 | 파일 |
|---|---|
| B | `contracts/verifier.sol` (새 버전, uint[5]) |
| D | `circuits/build/ticket_verify_js/ticket_verify.wasm` |
| D | `circuits/build/ticket_verify_final.zkey` |
| D | `scripts/generate_proof_sample.js` |

## Mock ↔ Real 전환
`.env`에서 `MOCK_BLOCKCHAIN=false` + 아래 채우기:
```
RPC_URL=http://<B노드>:8545
SERVER_PRIVATE_KEY=<authorizeMinter로 등록된 서버 지갑 키>
ISSUER_REGISTRY_ADDRESS=0x...
VC_REGISTRY_ADDRESS=0x...
TICKET_NFT_ADDRESS=0x...
```
B 함수명이 다르면 `src/services/blockchain.js` 상단 ABI만 수정.

## API 명세

### POST /api/vc/register-vc (C 어드민)
`{ "vcHash": "field 십진수", "issuer": "0x..." }` → `{ success, txHash }`

### POST /api/vc/verify-vp (C 웹 ← D 앱)
```json
{ "vp": { "holder":"0x..", "did":"did:qrush:..", "issuer":"0x..", "vcHash":"..", "claims":{"name":"..","age":23} },
  "signature": "0x.." }
```
서명 = `wallet.signMessage(JSON.stringify(vp))`, 키 순서 위와 동일하게.

### POST /api/ticket/mint-ticket (C 웹)
`{ "eventId":"1", "seatId":"1", "buyerWallet":"0x.." }` → `{ success, ticket{tokenId}, txHash }`
※ eventId/seatId는 B 컨트랙트가 uint256이라 숫자 권장.

### GET /api/ticket/by-wallet/:wallet (C 티켓 확인)

### POST /api/gate/generate-nonce (C 게이트)
→ `{ type:"QRushGateChallenge", nonce:"field", nonceHex, endpoint, expiresIn:30, chainTx }`
QR에는 이 JSON 전체를 담으면 D가 그대로 파싱 가능.

### POST /api/gate/verify-proof (D 앱)
```json
{ "proof":{..}, "publicSignals":[5개], "nonce":"field", "tokenId":"1", "vcHash":"field" }
```
→ 허용 `{ success:true, entry:true, txHash }` / 거부 401 `{ entry:false, error }`

## D의 proof input 조립
```js
const input = {
  birthdate: "20030415",     // private, YYYYMMDD
  vcHash:    "<field 십진수>", // public
  nonce:     "<generate-nonce의 nonce>",
  tokenId:   "1",
  currentDate: "20260613"
};
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
```
⚠️ vcHash는 BN254 field(<2^254) 안에 들어와야 함. 풀 32바이트 keccak이면 오버 가능 →
   15바이트(120bit) 또는 mod r 처리. C·D·체인이 **동일한 vcHash 표현** 쓸 것.

## 테스트
```bash
node scripts/test_offline.js   # ZKP/서명/mock 10개, MongoDB 불필요
npm run dev && node scripts/test_e2e.js   # 전체 + 재사용 공격 2종
```
