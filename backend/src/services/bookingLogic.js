/**
 * bookingLogic.js — VP 검증 + 티켓 발행 공통 로직
 * verify-vp 엔드포인트와 booking-session 릴레이가 함께 사용.
 */
const { ethers } = require("ethers");
const Ticket = require("../models/Ticket");
const blockchain = require("./blockchain");

/**
 * VP + 서명 검증. 세 체크를 독립 평가해서 결과 반환.
 * @returns { verified, signatureValid, issuerTrusted, vcValid }
 */
async function verifyVP(vp, signature) {
  let signatureValid = false;
  try {
    const recovered = ethers.verifyMessage(JSON.stringify(vp), signature);
    signatureValid = recovered.toLowerCase() === String(vp.holder).toLowerCase();
  } catch (e) {
    signatureValid = false;
  }

  const issuerTrusted = await blockchain.isTrustedIssuer(vp.issuer).catch(() => false);
  const vcValid = await blockchain.isValidVC(vp.vcHash).catch(() => false);

  const verified = signatureValid && issuerTrusted && vcValid;
  return { verified, signatureValid, issuerTrusted, vcValid };
}

/**
 * 티켓 발행 (좌석 중복 체크 + 온체인 mint + DB 저장).
 * @returns { ticket, txHash }  실패 시 throw
 */
async function mintTicket({ eventId, seatId, buyerWallet }) {
  if (!eventId || !seatId || !buyerWallet) {
    const e = new Error("eventId, seatId, buyerWallet are required");
    e.status = 400;
    throw e;
  }

  const taken = await Ticket.findOne({ eventId, seatId, status: { $ne: "CANCELLED" } });
  if (taken) {
    const e = new Error("Seat already taken");
    e.status = 409;
    throw e;
  }

  const { tokenId, txHash } = await blockchain.mintTicketNFT(buyerWallet, eventId, seatId);
  const ticket = await Ticket.create({ eventId, seatId, buyerWallet, tokenId, status: "VALID" });
  return { ticket, txHash };
}

module.exports = { verifyVP, mintTicket };
