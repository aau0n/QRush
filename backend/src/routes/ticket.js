const express = require("express");
const router = express.Router();

const {
    mintTicket
} = require("../controllers/ticketController");

router.post("/mint-ticket", mintTicket);

module.exports = router;