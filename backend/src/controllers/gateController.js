const crypto = require("crypto");
const Nonce = require("../models/Nonce");
const Ticket = require("../models/Ticket");
const zkp = require("../services/zkp");
const blockchain = require("../services/blockchain");

/**
 * POST /api/gate/generate-nonce  (C 게이트 단말기)
 */
exports.generateNonce = async (req, res) => {
  try {
    const nonceHex = crypto.randomBytes(16).toString("hex");
    const nonceField = BigInt("0x" + nonceHex).toString();

    await Nonce.create({ value: nonceField });

    let chainTx = null;
    try {
      const r = await blockchain.registerNonce(nonceField);
      chainTx = r.txHash;
    } catch (e) {
      console.warn("registerNonce failed:", e.message);
    }

    res.json({
      type: "QRushGateChallenge",
      nonce: nonceField,
      nonceHex,
      endpoint: "/api/gate/verify-proof",
      resultEndpoint: `/api/gate/result/${nonceField}`,
      expiresIn: 30,
      chainTx
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * nonce에 입장 결과를 기록하고 응답하는 헬퍼.
 * 게이트(C)가 GET /result/:nonce로 폴링해서 이 값을 읽음.
 */
async function settle(res, nonceValue, { granted, status, reason = null, tokenId = null, txHash = null }) {
  if (nonceValue != null) {
    await Nonce.updateOne(
      { value: String(nonceValue) },
      {
        $set: {
          result: granted ? "GRANTED" : "DENIED",
          resultReason: reason,
          tokenId: tokenId ? String(tokenId) : null,
          resolvedAt: new Date()
        }
      }
    );
  }
  if (granted) {
    return res.json({ success: true, entry: true, tokenId: String(tokenId), txHash });
  }
  return res.status(status || 401).json({ success: false, entry: false, error: reason });
}

/**
 * POST /api/gate/verify-proof  (D 앱)
 * body: { proof, publicSignals(5개), nonce(field), tokenId, vcHash }
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
      // 이 nonce가 이미 처리됐거나 만료. 결과는 기록 못 함(문서 없음).
      return res.status(401).json({ success: false, entry: false, error: "Nonce invalid, expired, or already used" });
    }

    const ps = zkp.parsePublicSignals(publicSignals);

    // 2. 바인딩 확인
    if (BigInt(ps.nonce) !== BigInt(nonce)) {
      return settle(res, nonce, { granted: false, reason: "Proof not bound to this nonce" });
    }
    if (BigInt(ps.tokenId) !== BigInt(tokenId)) {
      return settle(res, nonce, { granted: false, reason: "Proof not bound to this tokenId" });
    }
    if (vcHash != null && BigInt(ps.vcHash) !== BigInt(vcHash)) {
      return settle(res, nonce, { granted: false, reason: "Proof not bound to this vcHash" });
    }
    if (String(ps.isAdult) !== "1") {
      return settle(res, nonce, { granted: false, reason: "Not adult" });
    }

    // 3. 날짜
    const today = zkp.todayYYYYMMDD();
    if (Math.abs(Number(ps.currentDate) - today) > 1) {
      return settle(res, nonce, { granted: false, reason: "Proof date mismatch" });
    }

    // 4. 티켓 상태
    const ticket = await Ticket.findOne({ tokenId: String(tokenId) });
    if (!ticket) {
      return settle(res, nonce, { granted: false, status: 404, reason: "Ticket not found" });
    }
    if (ticket.status !== "VALID") {
      return settle(res, nonce, { granted: false, reason: `Ticket status is ${ticket.status}` });
    }

    // 5. VC 유효성
    const vcOk = await blockchain.isValidVC(ps.vcHash);
    if (!vcOk) {
      return settle(res, nonce, { granted: false, reason: "VC is not valid (revoked?)" });
    }

    // 6. ZKP 검증
    const ok = await zkp.verifyProof(proof, publicSignals);
    if (!ok) {
      return settle(res, nonce, { granted: false, reason: "Invalid ZK proof" });
    }

    // 7. 체인 useTicket (B 시그니처: tokenId, nonce, vcHash, currentDate, pA, pB, pC)
    const tx = await blockchain.useTicketNFT(tokenId, ps.nonce, ps.vcHash, ps.currentDate, proof);
    ticket.status = "USED";
    await ticket.save();

    return settle(res, nonce, { granted: true, tokenId, txHash: tx.txHash });
  } catch (err) {
    // 체인 등 예외 시에도 게이트가 빨간불 띄울 수 있게 결과 기록 시도
    try { await settle(res, req.body?.nonce, { granted: false, status: 500, reason: err.message }); }
    catch (_) { res.status(500).json({ success: false, entry: false, error: err.message }); }
  }
};

/**
 * GET /api/gate/result/:nonce  (C 게이트 단말기 폴링)
 * 게이트가 자기가 발급한 nonce에 대해 입장 결과를 조회.
 * 반환 result: PENDING(아직) | GRANTED(초록불) | DENIED(빨간불)
 */
exports.getResult = async (req, res) => {
  try {
    const doc = await Nonce.findOne({ value: String(req.params.nonce) });
    if (!doc) {
      // TTL로 사라졌거나 존재한 적 없음 → 만료로 간주
      return res.json({ found: false, result: "EXPIRED" });
    }
    res.json({
      found: true,
      result: doc.result,            // PENDING / GRANTED / DENIED
      reason: doc.resultReason,
      tokenId: doc.tokenId,
      resolvedAt: doc.resolvedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
