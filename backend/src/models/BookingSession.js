const mongoose = require("mongoose");

/**
 * BookingSession — PC 예매 페이지 ↔ 폰 앱 릴레이용 세션
 *
 * 흐름:
 *  1. PC가 create → sessionId 발급 (status: WAITING)
 *  2. 폰이 submit → 백엔드가 verify-vp + mint 실행 → status: COMPLETED / FAILED
 *  3. PC가 result 폴링 → COMPLETED면 티켓 정보 받아 화면 갱신
 */
const BookingSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },

  // PC가 세션 만들 때 담아둔 예매 정보 (어느 공연/좌석인지)
  eventId: { type: String, default: null },
  seatId: { type: String, default: null },

  status: {
    type: String,
    enum: ["WAITING", "COMPLETED", "FAILED"],
    default: "WAITING"
  },

  // 결과
  tokenId: { type: String, default: null },
  buyerWallet: { type: String, default: null },
  txHash: { type: String, default: null },
  checks: { type: Object, default: null },   // { signatureValid, issuerTrusted, vcValid }
  reason: { type: String, default: null },   // 실패 사유

  resolvedAt: { type: Date, default: null },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600   // 1시간 후 자동 삭제 (느린 MetaMask 서명 왕복·재시도 대비)
  }
});

module.exports = mongoose.model("BookingSession", BookingSessionSchema);
