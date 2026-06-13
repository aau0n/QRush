// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ZKPVerifier.sol";
import "./VCRegistry.sol";

/**
 * @title TicketNFT
 * @notice QRush - 공연 티켓 NFT 컨트랙트 (ERC-721)
 *
 * 흐름:
 *   1. 예매 서버가 mintTicket() 호출 → 구매자 지갑으로 NFT 발행
 *   2. 입장 시 useTicket() 호출 → ZKP 검증 + nonce 소비
 *   3. 취소 시 cancelTicket() 호출 → CANCELLED 상태로 전환
 *
 * Zero Trust 설계 원칙:
 *   - 입장 시 개인정보 없이 ZKP 증명값만 체인에 제출
 *   - 예매 서버 다운 시에도 게이트가 로컬 노드로 직접 useTicket() 호출 가능
 *   - nonce 유효시간(15초) 검증으로 QR 캡처 재사용 방지
 */
contract TicketNFT is ERC721, Ownable {

    // ─── 상수 ────────────────────────────────────────────────────────────────
    uint256 public constant NONCE_TTL = 15; // nonce 유효시간 (초)

    // ─── 열거형 ──────────────────────────────────────────────────────────────
    enum TicketStatus {
        VALID,      // 유효 (입장 가능)
        USED,       // 사용됨 (입장 완료)
        CANCELLED   // 취소됨
    }

    // ─── 티켓 데이터 ─────────────────────────────────────────────────────────
    struct TicketData {
        uint256 eventId;        // 공연 ID
        uint256 seatId;         // 좌석 ID
        uint256 issuedAt;       // 발행 타임스탬프
        TicketStatus status;
    }

    // ─── 상태 변수 ───────────────────────────────────────────────────────────
    ZKPVerifier public immutable zkpVerifier;
    VCRegistry  public immutable vcRegistry;

    uint256 private _tokenIdCounter;

    // tokenId → TicketData
    mapping(uint256 => TicketData) private _tickets;

    // nonce → 사용 여부 (재사용 방지)
    mapping(uint256 => bool) public usedNonces;

    // nonce → 생성 타임스탬프 (TTL 검증용)
    mapping(uint256 => uint256) public nonceCreatedAt;

    // 예매 서버 주소 화이트리스트 (mintTicket 권한)
    mapping(address => bool) public authorizedMinters;

    // ─── 이벤트 ──────────────────────────────────────────────────────────────
    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 eventId, uint256 seatId);
    event TicketUsed(uint256 indexed tokenId, uint256 nonce, uint256 timestamp);
    event TicketCancelled(uint256 indexed tokenId);
    event NonceRegistered(uint256 indexed nonce, uint256 createdAt);
    event MinterAuthorized(address indexed minter);
    event MinterRevoked(address indexed minter);

    // ─── 접근 제어 ───────────────────────────────────────────────────────────
    modifier onlyAuthorizedMinter() {
        require(authorizedMinters[msg.sender], "TicketNFT: caller is not authorized minter");
        _;
    }

    // ─── 생성자 ──────────────────────────────────────────────────────────────
    constructor(address _zkpVerifier, address _vcRegistry)
        ERC721("QRush Ticket", "QRTK")
        Ownable(msg.sender)
    {
        require(_zkpVerifier != address(0), "TicketNFT: zero address");
        require(_vcRegistry  != address(0), "TicketNFT: zero address");
        zkpVerifier = ZKPVerifier(_zkpVerifier);
        vcRegistry  = VCRegistry(_vcRegistry);
    }

    // ─── 발행 ────────────────────────────────────────────────────────────────

    /**
     * @notice NFT 티켓 발행 (예매 서버 → 구매자 지갑)
     * @param to      구매자 지갑 주소
     * @param eventId 공연 ID
     * @param seatId  좌석 ID
     * @return tokenId 발행된 NFT 토큰 ID
     */
    function mintTicket(address to, uint256 eventId, uint256 seatId)
        external
        onlyAuthorizedMinter
        returns (uint256 tokenId)
    {
        require(to != address(0), "TicketNFT: mint to zero address");
        _tokenIdCounter++;
        tokenId = _tokenIdCounter;

        _safeMint(to, tokenId);
        _tickets[tokenId] = TicketData({
            eventId:  eventId,
            seatId:   seatId,
            issuedAt: block.timestamp,
            status:   TicketStatus.VALID
        });

        emit TicketMinted(tokenId, to, eventId, seatId);
    }

    // ─── 입장 (ZKP 검증 + nonce 소비) ────────────────────────────────────────

    /**
     * @notice 게이트가 nonce를 체인에 등록 (QR 표시 직전 호출)
     * @param nonce       게이트 단말기가 생성한 1회용 값
     */
    function registerNonce(uint256 nonce) external onlyOwner {
        require(!usedNonces[nonce], "TicketNFT: nonce already used");
        require(nonceCreatedAt[nonce] == 0, "TicketNFT: nonce already registered");
        nonceCreatedAt[nonce] = block.timestamp;
        emit NonceRegistered(nonce, block.timestamp);
    }

    /**
     * @notice 입장 처리 — ZKP 증명 검증 후 티켓을 USED 상태로 전환
     *
     * @param tokenId    NFT 티켓 토큰 ID
     * @param nonce      게이트가 생성한 nonce (QR에 포함된 값)
     * @param vcHash     사용자 VC 해시 (pubSignals[0])
     * @param pA         ZKP proof.pi_a
     * @param pB         ZKP proof.pi_b
     * @param pC         ZKP proof.pi_c
     *
     * pubSignals 구성:
     *   [0] = vcHash
     *   [1] = nonce
     *   [2] = tokenId
     *   [3] = isAdult (1 = 성인)
     */
    function useTicket(
        uint256 tokenId,
        uint256 nonce,
        bytes32 vcHash,
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC
    ) external {
        // ── 1. 티켓 상태 확인 ──────────────────────────────────────────────
        TicketData storage ticket = _tickets[tokenId];
        require(ticket.status == TicketStatus.VALID, "TicketNFT: ticket not valid");

        // ── 2. nonce TTL 검증 (15초 이내) ──────────────────────────────────
        uint256 createdAt = nonceCreatedAt[nonce];
        require(createdAt != 0, "TicketNFT: nonce not registered");
        require(block.timestamp <= createdAt + NONCE_TTL, "TicketNFT: nonce expired");
        require(!usedNonces[nonce], "TicketNFT: nonce already used");

        // ── 3. VC 유효성 확인 ──────────────────────────────────────────────
        require(vcRegistry.isValidVC(vcHash), "TicketNFT: invalid VC");

        // ── 4. ZKP 증명 검증 ───────────────────────────────────────────────
        uint[4] memory pubSignals = [
            uint(vcHash),   // [0] vcHash
            nonce,          // [1] nonce
            tokenId,        // [2] tokenId
            1               // [3] isAdult — 회로에서 증명된 값; 여기선 1 고정(성인 공연 기준)
        ];
        require(
            zkpVerifier.verifyProof(pA, pB, pC, pubSignals),
            "TicketNFT: invalid ZKP proof"
        );

        // ── 5. nonce 소비 + 티켓 상태 업데이트 ────────────────────────────
        usedNonces[nonce] = true;
        ticket.status = TicketStatus.USED;

        emit TicketUsed(tokenId, nonce, block.timestamp);
    }

    // ─── 취소 ────────────────────────────────────────────────────────────────

    /**
     * @notice 티켓 취소 (예매 서버 또는 owner만 가능)
     */
    function cancelTicket(uint256 tokenId) external {
        require(
            msg.sender == owner() || authorizedMinters[msg.sender],
            "TicketNFT: not authorized"
        );
        TicketData storage ticket = _tickets[tokenId];
        require(ticket.status == TicketStatus.VALID, "TicketNFT: cannot cancel");
        ticket.status = TicketStatus.CANCELLED;
        emit TicketCancelled(tokenId);
    }

    // ─── 양도 ────────────────────────────────────────────────────────────────

    /**
     * @notice 티켓 양도 — VALID 상태인 티켓만 양도 가능
     */
    function transferTicket(address to, uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "TicketNFT: not ticket owner");
        require(_tickets[tokenId].status == TicketStatus.VALID, "TicketNFT: not transferable");
        _transfer(msg.sender, to, tokenId);
    }

    // ─── 조회 ────────────────────────────────────────────────────────────────

    function getTicket(uint256 tokenId) external view returns (TicketData memory) {
        return _tickets[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ─── 관리자 ──────────────────────────────────────────────────────────────

    function authorizeMinter(address minter) external onlyOwner {
        require(!authorizedMinters[minter], "TicketNFT: already authorized");
        authorizedMinters[minter] = true;
        emit MinterAuthorized(minter);
    }

    function revokeMinter(address minter) external onlyOwner {
        require(authorizedMinters[minter], "TicketNFT: not authorized");
        authorizedMinters[minter] = false;
        emit MinterRevoked(minter);
    }
}
