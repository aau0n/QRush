const mongoose = require("mongoose");

const TicketSchema = new mongoose.Schema({
  eventId: {
    /*type: mongoose.Schema.Types.ObjectId,
    ref: "Event"*/
    type: String
  },

  seatId: {
    type: String,
    required: true
  },

  tokenId: {
    type: String
  },

  buyerWallet: {
    type: String
  },

  status: {
    type: String,
    enum: ["VALID", "USED", "CANCELLED"],
    default: "VALID"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Ticket", TicketSchema);