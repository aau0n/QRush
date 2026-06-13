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
async function settle(res, nonceValue, { granted, status, reason = null, tokenId = null, txHash = null, publicSignals = null }) {
  if (nonceValue != null) {
    await Nonce.updateOne(
      { value: String(nonceValue) },
      {
        $set: {
          result: granted ? "GRANTED" : "DENIED",
          resultReason: reason,
          tokenId: tokenId ? String(tokenId) : null,
          txHash: txHash || null,
          publicSignals: Array.isArray(publicSignals) ? publicSignals.map(String) : null,
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
      // used=true로 이미 처리됐는지(재사용), 아니면 TTL로 사라졌는지(만료) 구분
      const existing = await Nonce.findOne({ value: String(nonce) });
      if (existing) {
        // 문서는 있는데 이미 used → 재사용 시도. 기존 결과는 보존하되 사유 기록.
        await Nonce.updateOne(
          { value: String(nonce) },
          { $set: { resultReason: "이미 사용된 nonce", resolvedAt: new Date() } }
        );
        return res.status(401).json({ success: false, entry: false, error: "이미 사용된 nonce" });
      }
      return res.status(401).json({ success: false, entry: false, error: "만료된 nonce" });
    }

    const ps = zkp.parsePublicSignals(publicSignals);

    // 2. 바인딩 확인
    if (BigInt(ps.nonce) !== BigInt(nonce)) {
      return settle(res, nonce, { granted: false, reason: "nonce가 일치하지 않는 증명", publicSignals });
    }
    if (BigInt(ps.tokenId) !== BigInt(tokenId)) {
      return settle(res, nonce, { granted: false, reason: "티켓이 일치하지 않는 증명", publicSignals });
    }
    if (vcHash != null && BigInt(ps.vcHash) !== BigInt(vcHash)) {
      return settle(res, nonce, { granted: false, reason: "VC가 일치하지 않는 증명", publicSignals });
    }
    if (String(ps.isAdult) !== "1") {
      return settle(res, nonce, { granted: false, reason: "성인 인증 실패", publicSignals });
    }

    // 3. 날짜
    const today = zkp.todayYYYYMMDD();
    if (Math.abs(Number(ps.currentDate) - today) > 1) {
      return settle(res, nonce, { granted: false, reason: "날짜가 맞지 않는 증명", publicSignals });
    }

    // 4. 티켓 상태
    const ticket = await Ticket.findOne({ tokenId: String(tokenId) });
    if (!ticket) {
      return settle(res, nonce, { granted: false, status: 404, reason: "존재하지 않는 티켓", publicSignals });
    }
    if (ticket.status !== "VALID") {
      return settle(res, nonce, { granted: false, reason: "이미 사용된 티켓", publicSignals });
    }

    // 5. VC 유효성
    const vcOk = await blockchain.isValidVC(ps.vcHash);
    if (!vcOk) {
      return settle(res, nonce, { granted: false, reason: "유효하지 않은 VC (폐기됨)", publicSignals });
    }

    // 6. ZKP 검증
    const ok = await zkp.verifyProof(proof, publicSignals);
    if (!ok) {
      return settle(res, nonce, { granted: false, reason: "유효하지 않은 증명", publicSignals });
    }

    // 7. 체인 useTicket (B 시그니처: tokenId, nonce, vcHash, currentDate, pA, pB, pC)
    const tx = await blockchain.useTicketNFT(tokenId, ps.nonce, ps.vcHash, ps.currentDate, proof);
    ticket.status = "USED";
    await ticket.save();

    return settle(res, nonce, { granted: true, tokenId, txHash: tx.txHash, publicSignals });
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
      // TTL로 사라졌거나 존재한 적 없음 → 만료로 간주 (게이트가 빨간불 처리)
      return res.json({ decided: true, entry: false, reason: "만료된 nonce", publicSignals: null });
    }
    if (doc.result === "PENDING") {
      return res.json({ decided: false });
    }
    if (doc.result === "GRANTED") {
      return res.json({
        decided: true,
        entry: true,
        tokenId: doc.tokenId,
        txHash: doc.txHash,
        publicSignals: doc.publicSignals || null
      });
    }
    // DENIED
    return res.json({
      decided: true,
      entry: false,
      reason: doc.resultReason,
      publicSignals: doc.publicSignals || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
