// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TicketNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    // 초기 배포 시 나윤님(Jesus)이 컨트랙트 관리 권한을 가집니다.
    constructor() ERC721("QRushTicket", "QRT") Ownable(msg.sender) {}

    // [Day 4 미션] 백엔드(팀원 B)의 VC 검증 결과에 따라 티켓 발행
    function mintTicket(address to) public onlyOwner {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }

    // [Day 4 미션] 티켓 소유권 확인 (게이트 단말기용)
    function verifyOwner(uint256 tokenId) public view returns (address) {
        return ownerOf(tokenId);
    }

    // [Day 4 미션] 티켓 양도 기능 (ERC-721 표준 기능 활용)
    function transferTicket(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId);
    }
}