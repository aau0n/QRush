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
    const tickets = await Ticket.find({ buyerWallet: req.params.wallet });
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
