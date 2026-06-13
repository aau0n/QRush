# QRush Backend — 연동 가이드 (A → B/C/D)

## 오늘 완료된 것
- ✅ verify-vp API (전자서명 + IssuerRegistry + VCRegistry 검증)
- ✅ register-vc API (C 어드민용)
- ✅ Circom 회로 작성 + 컴파일 (971 constraints)
- ✅ Trusted Setup (Powers of Tau + Groth16) → verification_key.json, verifier.sol
- ✅ verify-proof API (nonce 원자적 사용처리 + ZKP 검증 + useTicket)
- ✅ mint-ticket이 blockchain 서비스 경유 (mock/real 전환 가능)
- ✅ 오프라인 테스트 11개 통과 (proof 생성 ~0.9초)

## Mock ↔ Real 전환
`.env`에서 `MOCK_BLOCKCHAIN=true`(기본) → B 컨트랙트 없이 전체 플로우 동작.
내일 B한테 받으면:
```
MOCK_BLOCKCHAIN=false
RPC_URL=http://<B의 노드>:8545
SERVER_PRIVATE_KEY=<서버 지갑 키>
ISSUER_REGISTRY_ADDRESS=0x...
VC_REGISTRY_ADDRESS=0x...
TICKET_NFT_ADDRESS=0x...
```
ABI가 다르면 `src/services/blockchain.js` 상단 ABI 배열만 수정.

## 전달 파일
| 받는 사람 | 파일 | 용도 |
|---|---|---|
| B | `contracts/verifier.sol` | ZKPVerifier.sol에 통합 |
| D | `circuits/build/ticket_verify_js/ticket_verify.wasm` | 앱 번들링 |
| D | `circuits/build/ticket_verify_final.zkey` | 앱 번들링 |
| D | `scripts/generate_proof_sample.js` | fullProve 입력 조립 예제 |

## API 명세 (C, D 공유용)

### POST /api/vc/register-vc  (C 어드민)
```json
{ "vcHash": "12345...(십진수 문자열)", "issuer": "0x..." }
→ { "success": true, "txHash": "0x..." }
```

### POST /api/vc/verify-vp  (C 웹 ← D 앱)
```json
{
  "vp": {
    "holder": "0x지갑주소",
    "did": "did:qrush:user-...",
    "issuer": "0x발급기관주소",
    "vcHash": "12345...",
    "claims": { "name": "홍길동", "age": 23 }
  },
  "signature": "0x..."   // wallet.signMessage(JSON.stringify(vp))
}
→ { "success": true, "verified": true, "holder": "0x..." }
```
⚠️ **D 주의**: 서명 대상은 `JSON.stringify(vp)` 그대로. 키 순서까지 동일해야 하므로 위 순서로 객체 생성.

### POST /api/ticket/mint-ticket  (C 웹)
```json
{ "eventId": "ev1", "seatId": "A-12", "buyerWallet": "0x..." }
→ { "success": true, "ticket": { "tokenId": "1", ... }, "txHash": "0x..." }
```

### GET /api/ticket/by-wallet/:wallet  (C 티켓 확인 페이지)

### POST /api/gate/generate-nonce  (C 게이트 단말기)
```json
→ { "nonce": "hex(32자)", "nonceField": "십진수", "expiresInSec": 30 }
```
nonce는 16바이트(128bit) — BN254 field에 안전하게 들어가는 크기. QR에는 hex 그대로 표시.

### POST /api/gate/verify-proof  (D 앱)
```json
{
  "proof": { ... },                  // snarkjs.groth16.fullProve 결과
  "publicSignals": ["...","...","...","..."],
  "nonce": "QR에서 스캔한 hex",
  "tokenId": "1"
}
→ 입장 허용: { "success": true, "entry": true, "txHash": "0x..." }
→ 거부:     401 { "entry": false, "error": "..." }
```

## D의 proof 입력 조립 (publicSignals 순서 = [nonce, currentDate, tokenIdHash, vcHash])
```js
const input = {
  // private
  birthdate: "20030415",          // YYYYMMDD
  tokenId:   "1",
  vcSecret:  "987654321",         // VC 발급 시 받은 salt
  // public
  nonce:       BigInt("0x" + nonceHex).toString(),
  currentDate: "20260613",        // 오늘 YYYYMMDD
  tokenIdHash: poseidon([tokenId]),
  vcHash:      poseidon([birthdate, vcSecret])
};
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
```

## vcHash 정의 (중요, C·D 합의 필요)
`vcHash = Poseidon(birthdate, vcSecret)` — VC 발급 시 발급기관(C 어드민)이 vcSecret(랜덤 salt)을 생성해 VC에 포함시키고, 같은 vcHash를 register-vc로 등록.

## 테스트
```bash
node scripts/test_offline.js   # MongoDB 불필요, ZKP/서명/mock 검증 11개
npm run dev                    # 서버 실행 후 ↓
node scripts/test_e2e.js       # 전체 플로우 + 재사용 공격 2종 차단 확인
```
