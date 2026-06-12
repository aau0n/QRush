const crypto = require("crypto");
const Nonce = require("../models/Nonce");

exports.generateNonce = async (req, res) => {
  try {
    // 32바이트 랜덤 nonce 생성
    const nonce = crypto.randomBytes(32).toString("hex");

    // DB 저장
    await Nonce.create({
      value: nonce
    });

    // 클라이언트 반환
    res.json({
      nonce
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};