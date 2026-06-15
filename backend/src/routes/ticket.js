const express = require("express");
const router = express.Router();

const { mintTicket, getTicketsByWallet, cancelTicket } = require("../controllers/ticketController");

router.post("/mint-ticket", mintTicket);
router.get("/by-wallet/:wallet", getTicketsByWallet);
router.post("/cancel", cancelTicket);

module.exports = router;
