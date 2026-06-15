const crypto = require("crypto");
const BookingSession = require("../models/BookingSession");
const { verifyVP, mintTicket } = require("../services/bookingLogic");

/**
 * POST /api/booking/create-session   (PC 예매 페이지)
 * body: { eventId, seatId }
 * → sessionId 발급. PC는 이걸 QR에 담고 result를 폴링.
 */
exports.createSession = async (req, res) => {
  try {
    const { eventId, seatId } = req.body;
    const sessionId = crypto.randomBytes(12).toString("hex");

    await BookingSession.create({ sessionId, eventId: eventId || null, seatId: seatId || null });

    res.status(201).json({
      type: "QRushBookingSession",   // 폰 앱이 파싱하는 QR payload 형식
      sessionId,
      submitEndpoint: `/api/booking/submit/${sessionId}`,
      resultEndpoint: `/api/booking/result/${sessionId}`,
      eventId: eventId || null,
      seatId: seatId || null,
      expiresIn: 600
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/booking/submit/:sessionId   (폰 앱)
 * body: { vp, signature, eventId?, seatId? }
 * → VP 검증 + 티켓 발행까지 백엔드가 수행하고 세션에 결과 저장.
 *   PC는 이걸 직접 안 보고, result 폴링으로 받음.
 */
exports.submit = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { vp, signature } = req.body;

    const session = await BookingSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ success: false, error: "만료되거나 존재하지 않는 세션" });
    }
    if (session.status !== "WAITING") {
      return res.status(409).json({ success: false, error: "이미 처리된 세션" });
    }
    if (!vp || !signature) {
      return res.status(400).json({ success: false, error: "vp and signature are required" });
    }

    // 1. VP 검증
    const checks = await verifyVP(vp, signature);
    if (!checks.verified) {
      session.status = "FAILED";
      session.checks = checks;
      session.reason = !checks.signatureValid ? "서명 검증 실패"
        : !checks.issuerTrusted ? "신뢰할 수 없는 발급기관"
        : "유효하지 않은 VC";
      session.resolvedAt = new Date();
      await session.save();
      return res.status(401).json({ success: false, verified: false, ...checks });
    }

    // 2. 좌석 정보: 세션에 있으면 그걸, 없으면 body에서
    const eventId = session.eventId || req.body.eventId;
    const seatId = session.seatId || req.body.seatId;
    const buyerWallet = vp.holder;

    // 3. 티켓 발행
    let ticket, txHash;
    try {
      const r = await mintTicket({ eventId, seatId, buyerWallet });
      ticket = r.ticket;
      txHash = r.txHash;
    } catch (e) {
      session.status = "FAILED";
      session.checks = checks;
      session.reason = e.message;
      session.resolvedAt = new Date();
      await session.save();
      return res.status(e.status || 500).json({ success: false, error: e.message });
    }

    // 4. 세션에 결과 저장 → PC가 폴링으로 받음
    session.status = "COMPLETED";
    session.tokenId = String(ticket.tokenId);
    session.buyerWallet = buyerWallet;
    session.txHash = txHash;
    session.checks = checks;
    session.resolvedAt = new Date();
    await session.save();

    res.json({ success: true, verified: true, tokenId: String(ticket.tokenId), txHash, ...checks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/booking/result/:sessionId   (PC 예매 페이지 폴링)
 * → 대기: { decided: false }
 *   완료: { decided: true, success: true, tokenId, txHash, checks, eventId, seatId }
 *   실패: { decided: true, success: false, reason, checks }
 */
exports.getResult = async (req, res) => {
  try {
    const session = await BookingSession.findOne({ sessionId: req.params.sessionId });
    if (!session) {
      return res.json({ decided: true, success: false, reason: "만료되거나 존재하지 않는 세션" });
    }
    if (session.status === "WAITING") {
      return res.json({ decided: false });
    }
    if (session.status === "COMPLETED") {
      return res.json({
        decided: true,
        success: true,
        tokenId: session.tokenId,
        buyerWallet: session.buyerWallet,
        txHash: session.txHash,
        checks: session.checks,
        eventId: session.eventId,
        seatId: session.seatId
      });
    }
    // FAILED
    return res.json({
      decided: true,
      success: false,
      reason: session.reason,
      checks: session.checks
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
