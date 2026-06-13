const express = require("express");
const router = express.Router();

const { generateNonce, verifyProof, getResult } = require("../controllers/gateController");

router.post("/generate-nonce", generateNonce);
router.post("/verify-proof", verifyProof);
router.get("/result/:nonce", getResult);

module.exports = router;
