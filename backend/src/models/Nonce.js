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

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 30
  }
});

module.exports = mongoose.model("Nonce", NonceSchema);