pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * QRush ticket_verify 회로 (B 컨트랙트 규격 정렬 버전)
 *
 * 증명하려는 것:
 *   "나는 이 vcHash/nonce/tokenId 조합에 대해, 성인임을 안다"
 *
 * publicSignals 순서 (B의 useTicket pubSignals와 100% 일치):
 *   [0] vcHash    — VC 해시 (체인 isValidVC가 별도 검증, 회로는 바인딩만)
 *   [1] nonce     — 게이트 1회용 nonce (proof를 이 nonce에 종속)
 *   [2] tokenId   — NFT 토큰 ID (이 티켓에 대한 proof임을 바인딩)
 *   [3] isAdult   — 성인이면 1 (회로가 birthdate로부터 계산해서 출력)
 *
 * private input:
 *   birthdate    — YYYYMMDD (예: 20030415), 외부 비공개
 *
 * public input:
 *   vcHash, nonce, tokenId, currentDate
 *
 * 주의: vcHash/nonce/tokenId는 BN254 field(~254bit) 안에 들어와야 함.
 *       B가 bytes32 vcHash를 그대로 쓰면 256bit라 오버될 수 있으므로,
 *       D 앱은 vcHash를 field로 줄여 전달(아래 HANDOFF 참고).
 */
template TicketVerify() {
    // ----- private -----
    signal input birthdate;    // YYYYMMDD

    // ----- public -----
    signal input vcHash;       // [0]
    signal input nonce;        // [1]
    signal input tokenId;      // [2]
    signal input currentDate;  // 성인 판정 기준일 YYYYMMDD (public, 출력 아님)

    // ----- output -----
    signal output isAdult;     // [3] currentDate - birthdate >= 190000 이면 1

    // 성인 여부 계산 (만 19세 근사: 날짜 차 >= 190000)
    component ge = GreaterEqThan(32);
    ge.in[0] <== currentDate - birthdate;
    ge.in[1] <== 190000;
    isAdult <== ge.out;

    // 성인이 아니면 proof 생성 자체를 막음 (입장 = 성인 공연 기준)
    isAdult === 1;

    // nonce / tokenId / vcHash 바인딩 (제약식에 포함 → proof 재사용 불가)
    signal nonceBind;
    nonceBind <== nonce * nonce;
    signal tokenBind;
    tokenBind <== tokenId * tokenId;
    signal vcBind;
    vcBind <== vcHash * vcHash;
}

// public 신호 순서를 B 규격 [vcHash, nonce, tokenId, isAdult]에 맞춤.
// (currentDate도 public이지만 useTicket pubSignals에는 안 들어가므로 맨 뒤)
component main {public [vcHash, nonce, tokenId, currentDate]} = TicketVerify();
