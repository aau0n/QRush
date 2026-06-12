const express = require("express");
const router = express.Router();

const { generateNonce, verifyProof } = require("../controllers/gateController");

router.post("/generate-nonce", generateNonce);
router.post("/verify-proof", verifyProof);

module.exports = router;
