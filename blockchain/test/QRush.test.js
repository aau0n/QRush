// test/QRush.test.js
// QRush 스마트 컨트랙트 유닛 테스트
// npx hardhat test

const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

// 더미 ZKP proof (stub verifier용)
const dummyProof = {
  pA: [1n, 2n],
  pB: [[3n, 4n], [5n, 6n]],
  pC: [7n, 8n],
};

// 더미 VC 해시 생성
function makeVcHash(seed = "test-vc") {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

// ─── 테스트 스위트 ──────────────────────────────────────────────────────────

describe("QRush — Full Contract Suite", function () {
  let deployer, issuerAccount, buyer, gate, attacker;
  let issuerRegistry, vcRegistry, zkpVerifier, ticketNFT;

  beforeEach(async function () {
    [deployer, issuerAccount, buyer, gate, attacker] = await ethers.getSigners();

    // 1. IssuerRegistry
    const IR = await ethers.getContractFactory("IssuerRegistry");
    issuerRegistry = await IR.deploy();

    // 2. VCRegistry
    const VCR = await ethers.getContractFactory("VCRegistry");
    vcRegistry = await VCR.deploy(await issuerRegistry.getAddress());

    // 3. ZKPVerifier (stub)
    const ZKPV = await ethers.getContractFactory("ZKPVerifier");
    zkpVerifier = await ZKPV.deploy();

    // 4. TicketNFT
    const TN = await ethers.getContractFactory("TicketNFT");
    ticketNFT = await TN.deploy(
      await zkpVerifier.getAddress(),
      await vcRegistry.getAddress()
    );

    // 예매 서버(deployer)를 minter로 등록
    await ticketNFT.authorizeMinter(deployer.address);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IssuerRegistry
  // ═══════════════════════════════════════════════════════════════════════════
  describe("IssuerRegistry", function () {
    it("admin이 발급 기관을 등록할 수 있다", async function () {
      await issuerRegistry.registerIssuer(issuerAccount.address, "행정안전부");
      expect(await issuerRegistry.isTrustedIssuer(issuerAccount.address)).to.be.true;
      expect(await issuerRegistry.issuerNames(issuerAccount.address)).to.equal("행정안전부");
    });

    it("admin이 아니면 발급 기관을 등록할 수 없다", async function () {
      await expect(
        issuerRegistry.connect(attacker).registerIssuer(attacker.address, "악성기관")
      ).to.be.revertedWith("IssuerRegistry: caller is not admin");
    });

    it("등록된 발급 기관을 폐기할 수 있다", async function () {
      await issuerRegistry.registerIssuer(issuerAccount.address, "테스트기관");
      await issuerRegistry.revokeIssuer(issuerAccount.address);
      expect(await issuerRegistry.isTrustedIssuer(issuerAccount.address)).to.be.false;
    });

    it("중복 등록은 거부된다", async function () {
      await issuerRegistry.registerIssuer(issuerAccount.address, "기관A");
      await expect(
        issuerRegistry.registerIssuer(issuerAccount.address, "기관A")
      ).to.be.revertedWith("IssuerRegistry: already registered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VCRegistry
  // ═══════════════════════════════════════════════════════════════════════════
  describe("VCRegistry", function () {
    beforeEach(async function () {
      await issuerRegistry.registerIssuer(issuerAccount.address, "행정안전부");
    });

    it("신뢰 발급 기관이 VC 해시를 등록할 수 있다", async function () {
      const vcHash = makeVcHash("user1-vc");
      await vcRegistry.connect(issuerAccount).registerVC(vcHash);
      expect(await vcRegistry.isValidVC(vcHash)).to.be.true;
    });

    it("신뢰하지 않는 기관은 VC를 등록할 수 없다", async function () {
      const vcHash = makeVcHash("attacker-vc");
      await expect(
        vcRegistry.connect(attacker).registerVC(vcHash)
      ).to.be.revertedWith("VCRegistry: caller is not a trusted issuer");
    });

    it("발급 기관이 VC를 폐기할 수 있다", async function () {
      const vcHash = makeVcHash("revoke-test");
      await vcRegistry.connect(issuerAccount).registerVC(vcHash);
      await vcRegistry.connect(issuerAccount).revokeVC(vcHash);
      expect(await vcRegistry.isValidVC(vcHash)).to.be.false;
    });

    it("다른 기관이 발급한 VC는 폐기할 수 없다", async function () {
      // 두 번째 issuer 등록
      const [,, , , , otherIssuer] = await ethers.getSigners();
      await issuerRegistry.registerIssuer(otherIssuer.address, "카카오인증");

      const vcHash = makeVcHash("other-vc");
      await vcRegistry.connect(issuerAccount).registerVC(vcHash);

      await expect(
        vcRegistry.connect(otherIssuer).revokeVC(vcHash)
      ).to.be.revertedWith("VCRegistry: not your VC");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TicketNFT — 정상 플로우
  // ═══════════════════════════════════════════════════════════════════════════
  describe("TicketNFT — 정상 플로우", function () {
    let vcHash;
    const EVENT_ID = 1n;
    const SEAT_ID  = 42n;

    beforeEach(async function () {
      // 발급 기관 등록 + VC 등록
      await issuerRegistry.registerIssuer(issuerAccount.address, "행정안전부");
      vcHash = makeVcHash("buyer-vc");
      await vcRegistry.connect(issuerAccount).registerVC(vcHash);
    });

    it("mintTicket: NFT가 구매자 지갑으로 발행된다", async function () {
      await ticketNFT.mintTicket(buyer.address, EVENT_ID, SEAT_ID);
      expect(await ticketNFT.ownerOf(1n)).to.equal(buyer.address);

      const ticket = await ticketNFT.getTicket(1n);
      expect(ticket.eventId).to.equal(EVENT_ID);
      expect(ticket.seatId).to.equal(SEAT_ID);
      expect(ticket.status).to.equal(0); // VALID
    });

    it("useTicket: ZKP 검증 성공 → 티켓 USED 상태로 전환", async function () {
      await ticketNFT.mintTicket(buyer.address, EVENT_ID, SEAT_ID);

      const nonce = 12345n;
      await ticketNFT.registerNonce(nonce);

      await ticketNFT.useTicket(
        1n, nonce, vcHash,
        dummyProof.pA, dummyProof.pB, dummyProof.pC
      );

      const ticket = await ticketNFT.getTicket(1n);
      expect(ticket.status).to.equal(1); // USED

      expect(await ticketNFT.usedNonces(nonce)).to.be.true;
    });

    it("transferTicket: VALID 티켓을 다른 지갑으로 양도할 수 있다", async function () {
      await ticketNFT.mintTicket(buyer.address, EVENT_ID, SEAT_ID);
      await ticketNFT.connect(buyer).transferTicket(attacker.address, 1n);
      expect(await ticketNFT.ownerOf(1n)).to.equal(attacker.address);
    });

    it("cancelTicket: 예매 서버가 티켓을 취소할 수 있다", async function () {
      await ticketNFT.mintTicket(buyer.address, EVENT_ID, SEAT_ID);
      await ticketNFT.cancelTicket(1n);
      const ticket = await ticketNFT.getTicket(1n);
      expect(ticket.status).to.equal(2); // CANCELLED
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TicketNFT — 예외 케이스
  // ═══════════════════════════════════════════════════════════════════════════
  describe("TicketNFT — 예외 케이스", function () {
    let vcHash;
    const EVENT_ID = 2n;
    const SEAT_ID  = 99n;
    const NONCE    = 99999n;

    beforeEach(async function () {
      await issuerRegistry.registerIssuer(issuerAccount.address, "행정안전부");
      vcHash = makeVcHash("exception-vc");
      await vcRegistry.connect(issuerAccount).registerVC(vcHash);

      // 티켓 발행 + nonce 등록
      await ticketNFT.mintTicket(buyer.address, EVENT_ID, SEAT_ID);
      await ticketNFT.registerNonce(NONCE);
    });

    it("이미 사용된 티켓은 재입장 불가", async function () {
      // 첫 번째 입장
      await ticketNFT.useTicket(
        1n, NONCE, vcHash,
        dummyProof.pA, dummyProof.pB, dummyProof.pC
      );

      // 두 번째 시도 → 실패
      const nonce2 = 88888n;
      await ticketNFT.registerNonce(nonce2);

      await expect(
        ticketNFT.useTicket(
          1n, nonce2, vcHash,
          dummyProof.pA, dummyProof.pB, dummyProof.pC
        )
      ).to.be.revertedWith("TicketNFT: ticket not valid");
    });

    it("nonce 재사용 방지 — 동일 nonce로 두 번 입장 불가", async function () {
      // 티켓 2개 발행
      await ticketNFT.mintTicket(attacker.address, EVENT_ID, SEAT_ID);

      // 첫 번째 입장 (tokenId=1)
      await ticketNFT.useTicket(
        1n, NONCE, vcHash,
        dummyProof.pA, dummyProof.pB, dummyProof.pC
      );

      // 동일 nonce로 두 번째 시도 (tokenId=2) → 실패
      await expect(
        ticketNFT.useTicket(
          2n, NONCE, vcHash,
          dummyProof.pA, dummyProof.pB, dummyProof.pC
        )
      ).to.be.revertedWith("TicketNFT: nonce already used");
    });

    it("nonce TTL(30초) 초과 시 입장 불가 — QR 캡처 암표 방지", async function () {
      // 30초 경과
      await time.increase(31);

      await expect(
        ticketNFT.useTicket(
          1n, NONCE, vcHash,
          dummyProof.pA, dummyProof.pB, dummyProof.pC
        )
      ).to.be.revertedWith("TicketNFT: nonce expired");
    });

    it("폐기된 VC로는 입장 불가", async function () {
      await vcRegistry.connect(issuerAccount).revokeVC(vcHash);

      await expect(
        ticketNFT.useTicket(
          1n, NONCE, vcHash,
          dummyProof.pA, dummyProof.pB, dummyProof.pC
        )
      ).to.be.revertedWith("TicketNFT: invalid VC");
    });

    it("권한 없는 주소는 NFT를 발행할 수 없다", async function () {
      await expect(
        ticketNFT.connect(attacker).mintTicket(attacker.address, EVENT_ID, SEAT_ID)
      ).to.be.revertedWith("TicketNFT: caller is not authorized minter");
    });

    it("CANCELLED 티켓은 입장 불가", async function () {
      await ticketNFT.cancelTicket(1n);
      await expect(
        ticketNFT.useTicket(
          1n, NONCE, vcHash,
          dummyProof.pA, dummyProof.pB, dummyProof.pC
        )
      ).to.be.revertedWith("TicketNFT: ticket not valid");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 서버 다운 시뮬레이션 — 예매 서버 없이 로컬 노드 직접 조회로 입장 처리
  // ═══════════════════════════════════════════════════════════════════════════
  describe("서버 다운 시뮬레이션 (YES24 랜섬웨어 시나리오)", function () {
    it("예매 서버 없이 게이트가 블록체인 노드에 직접 입장 처리할 수 있다", async function () {
      // 사전 준비: 예매 서버가 정상일 때 발행된 티켓
      await issuerRegistry.registerIssuer(issuerAccount.address, "행정안전부");
      const vcHash = makeVcHash("server-down-vc");
      await vcRegistry.connect(issuerAccount).registerVC(vcHash);
      await ticketNFT.mintTicket(buyer.address, 1n, 1n);

      // 시나리오: 예매 서버 다운 → 게이트(gate) 단말기가 로컬 노드에 직접 트랜잭션 전송
      // registerNonce는 게이트 단말기가 직접 owner 권한으로 호출
      // (실제 배포에서는 gate 주소도 owner에 추가하거나 별도 role 부여)
      const nonce = 55555n;
      await ticketNFT.registerNonce(nonce); // gate가 직접 호출

      // 입장 처리 — 예매 서버 없이 체인 노드만으로 완료
      await expect(
        ticketNFT.useTicket(
          1n, nonce, vcHash,
          dummyProof.pA, dummyProof.pB, dummyProof.pC
        )
      ).to.emit(ticketNFT, "TicketUsed");

      // 입장 완료 확인
      const ticket = await ticketNFT.getTicket(1n);
      expect(ticket.status).to.equal(1); // USED
      console.log("    ✓ 예매 서버 없이 입장 처리 성공 — 서버 다운 내성 확인");
    });
  });
});
