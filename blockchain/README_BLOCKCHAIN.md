# 🎫 QRush Blockchain Development Guide

## 🛠 필수 환경
- **Node.js**: v22.22.0 (LTS v22권장
- **Hardhat**: v3.0.0 이상

## ⚠️ 로컬 노드 실행 필수 명령어 (중요)
노드 버전 보안 이슈로 인해 반드시 아래 옵션을 붙여야 서버가 켜집니다.
```bash
NODE_OPTIONS="--no-warnings --conditions=node" npx hardhat node
```

## 📦 배포 정보
- **Contract Address**: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **ABI**: `blockchain/artifacts/contracts/TicketNFT.sol/TicketNFT.json`

## 🧪 테스트 완료 내역
- [x] 컨트랙트 컴파일 성공
- [x] 로컬 네트워크 배포 성공
- [x] 티켓 발행(Mint) 테스트 완료 (`node scripts/test-mint.js`)
- [x] 티켓 전송(Transfer) 테스트 완료 (`node scripts/test-transfer.js`)

---
**Blockchain Core: 나윤(Jesus)**
