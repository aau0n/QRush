# QRush — 블록체인 파트 (B 담당)

Zero Trust 기반 공연 티켓팅 시스템의 스마트 컨트랙트 및 배포 환경

## 컨트랙트 구성

| 컨트랙트 | 역할 |
|---|---|
| `IssuerRegistry.sol` | 신뢰 발급 기관 등록/조회 |
| `VCRegistry.sol` | VC 해시 등록/폐기/유효성 조회 |
| `ZKPVerifier.sol` | ZKP(Groth16) 증명 검증 — **A의 verifier.sol로 교체 필요** |
| `TicketNFT.sol` | ERC-721 티켓 발행/입장/양도/취소 |

## 빠른 시작

```bash
npm install
npx hardhat compile
npx hardhat test
```

## 로컬 배포

```bash
# 터미널 1: 로컬 노드 실행
npx hardhat node

# 터미널 2: 배포
npx hardhat run scripts/deploy.js --network localhost
```

배포 완료 후 `deployed-addresses.json` 파일에 컨트랙트 주소가 저장됩니다.  
→ **A, C, D에게 이 파일 공유하세요!**

## A와 연동 (ZKPVerifier 교체)

1. A가 `snarkjs export solidityverifier circuit.zkey verifier.sol` 실행
2. `contracts/ZKPVerifier.sol`의 `verifyProof()` 함수 바디를 A의 코드로 교체
3. **함수 시그니처는 절대 변경하지 마세요** (TicketNFT 연동 깨짐)

```solidity
// 이 시그니처 유지 필수
function verifyProof(
    uint[2] calldata pA,
    uint[2][2] calldata pB,
    uint[2] calldata pC,
    uint[5] calldata pubSignals   // [isAdult, vcHash, nonce, tokenId, currentDate]
) external view returns (bool)
```

## pubSignals 배열 순서

| 인덱스 | 의미 |
|---|---|
| `[0]` | vcHash (VC 해시) |
| `[1]` | nonce (재사용 방지) |
| `[2]` | tokenId (NFT 티켓 ID) |
| `[3]` | isAdult (1 = 성인) |

## 테스트 커버리지

- ✅ 정상 플로우: mint → useTicket 성공
- ✅ 이미 사용된 티켓 재입장 거부
- ✅ 잘못된 ZKP 거부 (stub 기준)
- ✅ nonce 재사용 방지
- ✅ nonce TTL(15초) 초과 거부 (QR 캡처 암표 방지)
- ✅ 폐기된 VC 거부
- ✅ 서버 다운 시뮬레이션 — 예매 서버 없이 로컬 노드로 입장 처리
