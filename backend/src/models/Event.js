const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },

  venue: {
    type: String,
    required: true
  },

  date: {
    type: Date,
    required: true
  },

  totalSeats: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model("Event", EventSchema);