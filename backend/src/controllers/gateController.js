const crypto = require("crypto");
const Nonce = require("../models/Nonce");
const Ticket = require("../models/Ticket");
const zkp = require("../services/zkp");
const blockchain = require("../services/blockchain");

/**
 * POST /api/gate/generate-nonce
 * 게이트 단말기(C 웹)가 호출. 16바이트(128bit) nonce 생성.
 * ※ 32바이트가 아니라 16바이트인 이유: 회로 입력은 BN254 field 원소(< 2^254)여야 해서
 *   field 안에 안전하게 들어가는 128bit를 사용. 재사용 방지 목적에는 충분.
 */
exports.generateNonce = async (req, res) => {
  try {
    const nonce = crypto.randomBytes(16).toString("hex");
    await Nonce.create({ value: nonce });
    res.json({
      nonce,                                   // hex (QR에 표시)
      nonceField: BigInt("0x" + nonce).toString(), // 십진수 (회로 public input용)
      expiresInSec: 30
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/gate/verify-proof
 * D 앱이 ZKP 증명 전송. body:
 * {
 *   "proof": { pi_a, pi_b, pi_c, ... },     // snarkjs groth16 proof
 *   "publicSignals": ["nonce", "currentDate", "tokenIdHash", "vcHash"],
 *   "nonce": "hex string (QR에서 스캔한 값)",
 *   "tokenId": "1"
 * }
 *
 * 검증 순서:
 *  1. nonce가 DB에 존재 + 미사용 → 원자적으로 used 처리 (재사용 공격 방지)
 *  2. publicSignals[0] == nonce (proof가 이 nonce에 바인딩됐는지)
 *  3. publicSignals[1] == 오늘 날짜 (과거 proof 재사용 방지)
 *  4. publicSignals[2] == Poseidon(tokenId) (이 티켓에 대한 proof인지)
 *  5. 티켓 상태 VALID 확인
 *  6. snarkjs.groth16.verify
 *  7. 체인 useTicket 호출 + DB 상태 USED 업데이트
 */
exports.verifyProof = async (req, res) => {
  try {
    const { proof, publicSignals, nonce, tokenId } = req.body;
    if (!proof || !publicSignals || !nonce || !tokenId) {
      return res.status(400).json({ success: false, error: "proof, publicSignals, nonce, tokenId are required" });
    }

    // 1. nonce 확인 + 원자적 사용 처리 (TTL 만료됐으면 문서가 없어서 실패)
    const nonceDoc = await Nonce.findOneAndUpdate(
      { value: nonce, used: false },
      { $set: { used: true } },
      { new: true }
    );
    if (!nonceDoc) {
      return res.status(401).json({ success: false, entry: false, error: "Nonce invalid, expired, or already used" });
    }

    const ps = zkp.parsePublicSignals(publicSignals);

    // 2. proof가 이 nonce에 바인딩되어 있는지
    if (BigInt(ps.nonce) !== BigInt("0x" + nonce)) {
      return res.status(401).json({ success: false, entry: false, error: "Proof is not bound to this nonce" });
    }

    // 3. 날짜 확인 (오늘 기준 ±1일 허용)
    const today = zkp.todayYYYYMMDD();
    if (Math.abs(Number(ps.currentDate) - today) > 1) {
      return res.status(401).json({ success: false, entry: false, error: "Proof date mismatch" });
    }

    // 4. tokenIdHash 확인
    const expectedTokenHash = await zkp.poseidonHash([tokenId]);
    if (expectedTokenHash !== String(ps.tokenIdHash)) {
      return res.status(401).json({ success: false, entry: false, error: "tokenIdHash mismatch" });
    }

    // 5. 티켓 상태 확인
    const ticket = await Ticket.findOne({ tokenId: String(tokenId) });
    if (!ticket) {
      return res.status(404).json({ success: false, entry: false, error: "Ticket not found" });
    }
    if (ticket.status !== "VALID") {
      return res.status(401).json({ success: false, entry: false, error: `Ticket status is ${ticket.status}` });
    }

    // 5-1. VC 유효성 (폐기된 VC로 만든 proof 차단)
    const vcOk = await blockchain.isValidVC(ps.vcHash);
    if (!vcOk) {
      return res.status(401).json({ success: false, entry: false, error: "VC is not valid (revoked?)" });
    }

    // 6. ZKP 검증
    const ok = await zkp.verifyProof(proof, publicSignals);
    if (!ok) {
      return res.status(401).json({ success: false, entry: false, error: "Invalid ZK proof" });
    }

    // 7. 체인 + DB 상태 업데이트
    const tx = await blockchain.useTicketNFT(tokenId, proof, publicSignals);
    ticket.status = "USED";
    await ticket.save();

    res.json({ success: true, entry: true, tokenId: String(tokenId), txHash: tx.txHash });
  } catch (err) {
    res.status(500).json({ success: false, entry: false, error: err.message });
  }
};
