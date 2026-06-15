const express = require("express");
const router = express.Router();

const { createSession, submit, getResult } = require("../controllers/bookingController");

router.post("/create-session", createSession);
router.post("/submit/:sessionId", submit);
router.get("/result/:sessionId", getResult);

module.exports = router;
