pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * QRush ticket_verify v3 — 본인 인증(self-sovereign) 강화판
 *
 * Proves (영지식으로):
 *  1. 본인 인증: Poseidon(birthdate, vcSecret) == vcHash
 *     → vcSecret(VC 발급 시 본인에게만 주어진 비밀)을 아는 사람만 proof 생성 가능.
 *       즉 "이 VC의 진짜 주인"임을 birthdate·vcSecret 노출 없이 증명. ★핵심★
 *  2. 성인 인증: currentDate - birthdate >= 190000 (만 19세 근사)
 *  3. nonce / tokenId 바인딩: proof를 특정 게이트 nonce·티켓에 묶음 (재사용 방지)
 *
 * private input : birthdate, vcSecret
 * public  input : vcHash, nonce, tokenId, currentDate
 *
 * snarkjs publicSignals order:
 *   [0] isAdult      output
 *   [1] vcHash       public input
 *   [2] nonce        public input
 *   [3] tokenId      public input
 *   [4] currentDate  public input
 */
template TicketVerify() {
    // private
    signal input birthdate;    // YYYYMMDD
    signal input vcSecret;     // VC 발급 시 본인에게만 주어진 랜덤 secret

    // public
    signal input vcHash;
    signal input nonce;
    signal input tokenId;
    signal input currentDate;  // YYYYMMDD

    // output
    signal output isAdult;

    // 1. 본인 인증: Poseidon(birthdate, vcSecret) == vcHash
    component vcHasher = Poseidon(2);
    vcHasher.inputs[0] <== birthdate;
    vcHasher.inputs[1] <== vcSecret;
    vcHasher.out === vcHash;

    // 2. 성인 인증
    component ge = GreaterEqThan(32);
    ge.in[0] <== currentDate - birthdate;
    ge.in[1] <== 190000;
    isAdult <== ge.out;
    isAdult === 1;

    // 3. nonce / tokenId 바인딩 (제약식에 포함 → proof 재사용 불가)
    signal nonceBind;
    nonceBind <== nonce * nonce;

    signal tokenBind;
    tokenBind <== tokenId * tokenId;
}

component main {public [vcHash, nonce, tokenId, currentDate]} = TicketVerify();
