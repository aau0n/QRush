// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IssuerRegistry
 * @notice QRush - 신뢰 발급 기관 등록 및 조회 컨트랙트
 * @dev 어드민만 발급 기관을 추가/제거할 수 있음
 */
contract IssuerRegistry {
    address public admin;

    // 발급 기관 주소 → 등록 여부
    mapping(address => bool) private trustedIssuers;
    // 발급 기관 주소 → 이름 (human-readable)
    mapping(address => string) public issuerNames;

    event IssuerRegistered(address indexed issuer, string name);
    event IssuerRevoked(address indexed issuer);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "IssuerRegistry: caller is not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @notice 신뢰 발급 기관 등록
     * @param issuer 발급 기관의 이더리움 주소
     * @param name   발급 기관 이름 (예: "행정안전부", "카카오인증")
     */
    function registerIssuer(address issuer, string calldata name) external onlyAdmin {
        require(issuer != address(0), "IssuerRegistry: zero address");
        require(!trustedIssuers[issuer], "IssuerRegistry: already registered");
        trustedIssuers[issuer] = true;
        issuerNames[issuer] = name;
        emit IssuerRegistered(issuer, name);
    }

    /**
     * @notice 발급 기관 등록 취소 (폐기)
     */
    function revokeIssuer(address issuer) external onlyAdmin {
        require(trustedIssuers[issuer], "IssuerRegistry: not registered");
        trustedIssuers[issuer] = false;
        emit IssuerRevoked(issuer);
    }

    /**
     * @notice 발급 기관 신뢰 여부 조회
     */
    function isTrustedIssuer(address issuer) external view returns (bool) {
        return trustedIssuers[issuer];
    }

    /**
     * @notice 어드민 권한 이전
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "IssuerRegistry: zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
