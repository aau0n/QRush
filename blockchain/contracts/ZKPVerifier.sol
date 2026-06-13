// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Groth16Verifier.sol";

/**
 * @title ZKPVerifier
 * @notice TicketNFT ↔ A Groth16Verifier(v2) 래퍼
 *
 * pubSignals (uint[5]): [isAdult, vcHash, nonce, tokenId, currentDate]
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
        return groth16.verifyProof(pA, pB, pC, pubSignals);
    }
}
