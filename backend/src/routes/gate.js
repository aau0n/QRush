const express = require("express");

const router = express.Router();

const {
  generateNonce
} = require("../controllers/gateController");

router.post("/generate-nonce", generateNonce);

module.exports = router;