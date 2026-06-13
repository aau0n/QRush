// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Groth16Verifier.sol";

/**
 * @title ZKPVerifier
 * @notice TicketNFT ↔ A Groth16Verifier 래퍼
 *
 * TicketNFT pubSignals (uint[5]):
 *   [0] isAdult, [1] vcHash, [2] nonce, [3] tokenId, [4] currentDate
 *
 * A 회로 Groth16Verifier (uint[4]):
 *   [0] nonce, [1] currentDate, [2] tokenIdHash, [3] vcHash
 */
contract ZKPVerifier {
    Groth16Verifier public immutable groth16;

    constructor() {
        groth16 = new Groth16Verifier();
    }

    function verifyProof(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[5] calldata pubSignals
    ) external view returns (bool) {
        require(pubSignals[0] == 1, "ZKPVerifier: not adult");

        uint[4] memory circuitSignals = [
            pubSignals[2], // nonce
            pubSignals[4], // currentDate
            pubSignals[3], // tokenIdHash slot (proof 생성 측에서 hash 값 전달)
            pubSignals[1]  // vcHash
        ];

        return groth16.verifyProof(pA, pB, pC, circuitSignals);
    }
}
