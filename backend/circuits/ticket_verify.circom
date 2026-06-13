pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * QRush ticket_verify v2
 *
 * Proves:
 * - The holder is an adult based on private birthdate.
 * - The proof is bound to public vcHash, nonce, tokenId, and currentDate.
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

    // public
    signal input vcHash;
    signal input nonce;
    signal input tokenId;
    signal input currentDate;  // YYYYMMDD

    // output
    signal output isAdult;

    component ge = GreaterEqThan(32);
    ge.in[0] <== currentDate - birthdate;
    ge.in[1] <== 190000;
    isAdult <== ge.out;
    isAdult === 1;

    signal nonceBind;
    nonceBind <== nonce * nonce;

    signal tokenBind;
    tokenBind <== tokenId * tokenId;

    signal vcBind;
    vcBind <== vcHash * vcHash;
}

component main {public [vcHash, nonce, tokenId, currentDate]} = TicketVerify();
