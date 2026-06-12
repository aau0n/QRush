const express = require("express");
const router = express.Router();

const { mintTicket, getTicketsByWallet } = require("../controllers/ticketController");

router.post("/mint-ticket", mintTicket);
router.get("/by-wallet/:wallet", getTicketsByWallet);

module.exports = router;
