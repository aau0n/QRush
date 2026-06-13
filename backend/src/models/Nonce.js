const mongoose = require("mongoose");

const NonceSchema = new mongoose.Schema({
  value: {
    type: String,
    required: true,
    unique: true
  },

  used: {
    type: Boolean,
    default: false
  },

  // 게이트(C)가 폴링할 입장 결과
  result: {
    type: String,
    enum: ["PENDING", "GRANTED", "DENIED"],
    default: "PENDING"
  },
  resultReason: {
    type: String,
    default: null
  },
  tokenId: {
    type: String,
    default: null
  },
  txHash: {
    type: String,
    default: null
  },
  publicSignals: {
    type: [String],
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60   // 게이트 폴링 여유를 위해 30→60초
  }
});

module.exports = mongoose.model("Nonce", NonceSchema);
