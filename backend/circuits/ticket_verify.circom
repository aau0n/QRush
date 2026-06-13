pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * QRush ticket_verify 회로 (간소화 3-컴포넌트 버전)
 *
 *  1. 성인 여부 검증  : currentDate(YYYYMMDD) - birthdate(YYYYMMDD) >= 190000 (만 19세 근사)
 *  2. tokenId 확인    : Poseidon(tokenId) == tokenIdHash (public)
 *  3. VC 유효성       : Poseidon(birthdate, vcSecret) == vcHash (public, 체인의 VCRegistry에 등록된 값)
 *  4. nonce 바인딩    : nonce를 제약식에 포함시켜 proof가 특정 nonce에 종속되게 함 (재사용 방지)
 *
 *  private inputs : birthdate, tokenId, vcSecret
 *  public  inputs : nonce, currentDate, tokenIdHash, vcHash
 *
 *  publicSignals 순서 = [nonce, currentDate, tokenIdHash, vcHash]
 */
template TicketVerify() {
    // ----- private -----
    signal input birthdate;   // 예: 20030415
    signal input tokenId;     // NFT tokenId (정수)
    signal input vcSecret;    // VC 발급 시 들어간 salt (VC 안에 포함)

    // ----- public -----
    signal input nonce;       // 게이트가 발급한 1회용 nonce (field 원소, < 2^128 권장)
    signal input currentDate; // 게이트 측 오늘 날짜 YYYYMMDD
    signal input tokenIdHash; // Poseidon(tokenId)
    signal input vcHash;      // Poseidon(birthdate, vcSecret)

    // 1. 성인 여부 (currentDate - birthdate >= 190000)
    component ageCheck = GreaterEqThan(32);
    ageCheck.in[0] <== currentDate - birthdate;
    ageCheck.in[1] <== 190000;
    ageCheck.out === 1;

    // 2. tokenId 확인
    component tokenHasher = Poseidon(1);
    tokenHasher.inputs[0] <== tokenId;
    tokenHasher.out === tokenIdHash;

    // 3. VC 유효성 (vcHash 바인딩)
    component vcHasher = Poseidon(2);
    vcHasher.inputs[0] <== birthdate;
    vcHasher.inputs[1] <== vcSecret;
    vcHasher.out === vcHash;

    // 4. nonce 바인딩 (제약식에 포함시켜 proof 재사용 불가)
    signal nonceSquared;
    nonceSquared <== nonce * nonce;
}

component main {public [nonce, currentDate, tokenIdHash, vcHash]} = TicketVerify();
