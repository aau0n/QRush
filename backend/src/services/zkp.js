const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");

const VKEY_PATH = path.join(__dirname, "../../circuits/build/verification_key.json");
let vKey = null;

function getVKey() {
  if (!vKey) vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
  return vKey;
}

exports.verifyProof = async (proof, publicSignals) => {
  return snarkjs.groth16.verify(getVKey(), publicSignals, proof);
};

// v2 publicSignals order: [isAdult, vcHash, nonce, tokenId, currentDate]
exports.parsePublicSignals = (publicSignals) => {
  if (!Array.isArray(publicSignals) || publicSignals.length !== 5) {
    throw new Error("publicSignals must contain 5 values");
  }

  return {
    isAdult: publicSignals[0],
    vcHash: publicSignals[1],
    nonce: publicSignals[2],
    tokenId: publicSignals[3],
    currentDate: publicSignals[4]
  };
};

exports.todayYYYYMMDD = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return Number(
    `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`
  );
};
