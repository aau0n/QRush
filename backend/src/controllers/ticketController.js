const Ticket = require("../models/Ticket");
const blockchain = require("../services/blockchain");

/**
 * POST /api/ticket/mint-ticket
 * body: { eventId, seatId, buyerWallet }
 * verify-vp 성공 후 C 웹이 호출. NFT 발행 후 tokenId 반환.
 */
exports.mintTicket = async (req, res) => {
  try {
    const { eventId, seatId, buyerWallet } = req.body;
    if (!eventId || !seatId || !buyerWallet) {
      return res.status(400).json({ success: false, error: "eventId, seatId, buyerWallet are required" });
    }

    // 같은 좌석 중복 예매 방지
    const taken = await Ticket.findOne({ eventId, seatId, status: { $ne: "CANCELLED" } });
    if (taken) {
      return res.status(409).json({ success: false, error: "Seat already taken" });
    }

    // NFT 발행 (mock 모드면 인메모리 발행)
    const { tokenId, txHash } = await blockchain.mintTicketNFT(buyerWallet, eventId, seatId);

    const ticket = await Ticket.create({
      eventId,
      seatId,
      buyerWallet,
      tokenId,
      status: "VALID"
    });

    res.status(201).json({ success: true, ticket, txHash, mock: blockchain.isMock });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/ticket/by-wallet/:wallet
 * C의 티켓 확인 페이지용 — 지갑 주소로 보유 티켓 조회
 */
exports.getTicketsByWallet = async (req, res) => {
  try {
    // 지갑 주소 대소문자 무시로 정확일치 조회 (체크섬/소문자 혼용 대비)
    const wallet = String(req.params.wallet || '');
    const escaped = wallet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tickets = await Ticket.find({
      buyerWallet: new RegExp(`^${escaped}$`, "i"),
    });
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/ticket/cancel
 * body: { tokenId, wallet? }   // wallet은 참고/검증용(선택)
 * C 티켓 확인 페이지의 "예매 취소" 버튼이 호출. 온체인 cancelTicket 실행.
 * 서버 지갑이 authorizedMinter라 구매자 서명 불필요.
 */
exports.cancelTicket = async (req, res) => {
  try {
    const { tokenId, wallet } = req.body;
    if (tokenId == null) {
      return res.status(400).json({ success: false, error: "tokenId is required" });
    }

    const ticket = await Ticket.findOne({ tokenId: String(tokenId) });
    if (!ticket) {
      return res.status(404).json({ success: false, error: "Ticket not found" });
    }

    // (선택) 소유자 검증: wallet이 오면 실제 구매자와 일치하는지 확인
    if (wallet && String(ticket.buyerWallet).toLowerCase() !== String(wallet).toLowerCase()) {
      return res.status(403).json({ success: false, error: "Wallet does not own this ticket" });
    }

    // 이미 사용/취소된 티켓은 취소 불가 (컨트랙트도 require(VALID)로 막지만 미리 거름)
    if (ticket.status !== "VALID") {
      return res.status(400).json({ success: false, error: `Cannot cancel: ticket status is ${ticket.status}` });
    }

    // 온체인 취소 (mock이면 인메모리 상태만)
    let txHash = null;
    try {
      const r = await blockchain.cancelTicketNFT(tokenId);
      txHash = r.txHash;
    } catch (e) {
      // 컨트랙트 revert(이미 USED/CANCELLED 등) → 400
      return res.status(400).json({ success: false, error: `On-chain cancel failed: ${e.message}` });
    }

    // DB 상태 동기화
    ticket.status = "CANCELLED";
    await ticket.save();

    res.json({ success: true, tokenId: String(tokenId), status: "CANCELLED", txHash });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
