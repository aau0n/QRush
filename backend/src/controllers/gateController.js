const crypto = require("crypto");
const Nonce = require("../models/Nonce");
const Ticket = require("../models/Ticket");
const zkp = require("../services/zkp");
const blockchain = require("../services/blockchain");

/**
 * POST /api/gate/generate-nonce  (C 게이트 단말기)
 * 16바이트(128bit) nonce 생성 → DB 저장 + 체인 registerNonce 호출.
 * nonce는 hex와 field(십진수) 두 형태로 반환. 회로/체인은 field를 사용.
 */
exports.generateNonce = async (req, res) => {
  try {
    const nonceHex = crypto.randomBytes(16).toString("hex");
    const nonceField = BigInt("0x" + nonceHex).toString();

    await Nonce.create({ value: nonceField });

    // 체인에도 등록 (B의 useTicket이 nonceCreatedAt 검사함). mock이면 인메모리.
    let chainTx = null;
    try {
      const r = await blockchain.registerNonce(nonceField);
      chainTx = r.txHash;
    } catch (e) {
      // 체인 등록 실패해도 데모 흐름은 계속 (로그만)
      console.warn("registerNonce failed:", e.message);
    }

    res.json({
      type: "QRushGateChallenge",   // D 앱이 파싱하는 QR payload 형식
      nonce: nonceField,            // 회로/체인 입력용 (십진수)
      nonceHex,                     // 참고용
      endpoint: "/api/gate/verify-proof",
      expiresIn: 30,
      chainTx
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/gate/verify-proof  (D 앱)
 * body: { proof, publicSignals(5개), nonce(field), tokenId, vcHash }
 *
 * 검증 순서:
 *  1. nonce DB 원자적 사용처리 (서버단 1차 재사용 차단)
 *  2. publicSignals 파싱 → nonce/tokenId/isAdult 바인딩 확인
 *  3. 날짜 확인
 *  4. 티켓 상태 VALID 확인
 *  5. VC 유효성 (isValidVC)
 *  6. snarkjs.groth16.verify
 *  7. 체인 useTicket (B가 nonce TTL + ZKP 재검증 + USED 전환)
 */
exports.verifyProof = async (req, res) => {
  try {
    const { proof, publicSignals, nonce, tokenId, vcHash } = req.body;
    if (!proof || !publicSignals || nonce == null || tokenId == null) {
      return res.status(400).json({ success: false, error: "proof, publicSignals, nonce, tokenId are required" });
    }

    // 1. nonce 원자적 사용처리
    const nonceDoc = await Nonce.findOneAndUpdate(
      { value: String(nonce), used: false },
      { $set: { used: true } },
      { returnDocument: "after" }
    );
    if (!nonceDoc) {
      return res.status(401).json({ success: false, entry: false, error: "Nonce invalid, expired, or already used" });
    }

    const ps = zkp.parsePublicSignals(publicSignals);

    // 2. 바인딩 확인
    if (BigInt(ps.nonce) !== BigInt(nonce)) {
      return res.status(401).json({ success: false, entry: false, error: "Proof not bound to this nonce" });
    }
    if (BigInt(ps.tokenId) !== BigInt(tokenId)) {
      return res.status(401).json({ success: false, entry: false, error: "Proof not bound to this tokenId" });
    }
    if (String(ps.isAdult) !== "1") {
      return res.status(401).json({ success: false, entry: false, error: "Not adult" });
    }

    // 3. 날짜 (오늘 기준 ±1일)
    const today = zkp.todayYYYYMMDD();
    if (Math.abs(Number(ps.currentDate) - today) > 1) {
      return res.status(401).json({ success: false, entry: false, error: "Proof date mismatch" });
    }

    // 4. 티켓 상태
    const ticket = await Ticket.findOne({ tokenId: String(tokenId) });
    if (!ticket) return res.status(404).json({ success: false, entry: false, error: "Ticket not found" });
    if (ticket.status !== "VALID") {
      return res.status(401).json({ success: false, entry: false, error: `Ticket status is ${ticket.status}` });
    }

    // 5. VC 유효성
    const vcOk = await blockchain.isValidVC(ps.vcHash);
    if (!vcOk) {
      return res.status(401).json({ success: false, entry: false, error: "VC is not valid (revoked?)" });
    }

    // 6. ZKP 검증
    const ok = await zkp.verifyProof(proof, publicSignals);
    if (!ok) {
      return res.status(401).json({ success: false, entry: false, error: "Invalid ZK proof" });
    }

    // 7. 체인 useTicket (실제 모드면 여기서 nonce TTL/ZKP 재검증됨)
    const tx = await blockchain.useTicketNFT(tokenId, ps.nonce, ps.vcHash, proof);
    ticket.status = "USED";
    await ticket.save();

    res.json({ success: true, entry: true, tokenId: String(tokenId), txHash: tx.txHash });
  } catch (err) {
    res.status(500).json({ success: false, entry: false, error: err.message });
  }
};
