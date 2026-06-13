// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IssuerRegistry.sol";

/**
 * @title VCRegistry
 * @notice QRush - Verifiable Credential 해시 등록/폐기/유효성 조회
 * @dev VC 원문은 사용자 지갑에만 보관. 체인에는 해시와 발급자 주소만 기록.
 */
contract VCRegistry {
    IssuerRegistry public immutable issuerRegistry;

    struct VCRecord {
        address issuer;     // VC를 발급한 기관 주소
        uint256 issuedAt;   // 발급 타임스탬프
        bool revoked;       // 폐기 여부
    }

    // vcHash → VCRecord
    mapping(bytes32 => VCRecord) private vcRecords;

    event VCRegistered(bytes32 indexed vcHash, address indexed issuer, uint256 issuedAt);
    event VCRevoked(bytes32 indexed vcHash, address indexed issuer);

    modifier onlyTrustedIssuer() {
        require(
            issuerRegistry.isTrustedIssuer(msg.sender),
            "VCRegistry: caller is not a trusted issuer"
        );
        _;
    }

    constructor(address _issuerRegistry) {
        require(_issuerRegistry != address(0), "VCRegistry: zero address");
        issuerRegistry = IssuerRegistry(_issuerRegistry);
    }

    /**
     * @notice VC 해시 등록 (발급 기관만 호출 가능)
     * @param vcHash  keccak256(VC JSON) — 개인정보 없이 해시만 체인에 기록
     */
    function registerVC(bytes32 vcHash) external onlyTrustedIssuer {
        require(vcRecords[vcHash].issuedAt == 0, "VCRegistry: already registered");
        vcRecords[vcHash] = VCRecord({
            issuer: msg.sender,
            issuedAt: block.timestamp,
            revoked: false
        });
        emit VCRegistered(vcHash, msg.sender, block.timestamp);
    }

    /**
     * @notice VC 폐기 (발급한 기관만 폐기 가능)
     */
    function revokeVC(bytes32 vcHash) external onlyTrustedIssuer {
        VCRecord storage rec = vcRecords[vcHash];
        require(rec.issuedAt != 0, "VCRegistry: not found");
        require(rec.issuer == msg.sender, "VCRegistry: not your VC");
        require(!rec.revoked, "VCRegistry: already revoked");
        rec.revoked = true;
        emit VCRevoked(vcHash, msg.sender);
    }

    /**
     * @notice VC 유효성 조회
     * @return valid  등록되어 있고 폐기되지 않으면 true
     */
    function isValidVC(bytes32 vcHash) external view returns (bool valid) {
        VCRecord storage rec = vcRecords[vcHash];
        return rec.issuedAt != 0 && !rec.revoked;
    }

    /**
     * @notice VC 상세 정보 조회
     */
    function getVCRecord(bytes32 vcHash)
        external
        view
        returns (address issuer, uint256 issuedAt, bool revoked)
    {
        VCRecord storage rec = vcRecords[vcHash];
        return (rec.issuer, rec.issuedAt, rec.revoked);
    }
}
