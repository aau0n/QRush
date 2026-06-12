const express = require("express");
const router = express.Router();

const { verifyVP, registerVC } = require("../controllers/vcController");

router.post("/verify-vp", verifyVP);
router.post("/register-vc", registerVC);

module.exports = router;
