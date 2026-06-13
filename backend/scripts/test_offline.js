process.env.MOCK_BLOCKCHAIN = "true";

const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");
const zkp = require("../src/services/zkp");

const WASM = path.join(__dirname, "../circuits/build/ticket_verify_js/ticket_verify.wasm");
const ZKEY = path.join(__dirname, "../circuits/build/ticket_verify_final.zkey");

let pass = 0;
let fail = 0;

const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log("  OK", name);
  } else {
    fail += 1;
    console.log("  FAIL", name);
  }
};

async function main() {
  console.log("[1] proof generation");
  const nonce = BigInt("0x" + crypto.randomBytes(16).toString("hex")).toString();
  const tokenId = "1";
  const birthdate = "20030415";
  const vcHash = BigInt("0x" + crypto.randomBytes(15).toString("hex")).toString();
  const currentDate = String(zkp.todayYYYYMMDD());
  const input = { birthdate, vcHash, nonce, tokenId, currentDate };

  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`  generated in ${Date.now() - t0}ms, signals=${publicSignals.length}`);

  const ps = zkp.parsePublicSignals(publicSignals);
  check("groth16.verify == true", await zkp.verifyProof(proof, publicSignals));
  check("publicSignals length == 5", publicSignals.length === 5);
  check("publicSignals[0] == isAdult", String(ps.isAdult) === "1");
  check("publicSignals[1] == vcHash", BigInt(ps.vcHash) === BigInt(vcHash));
  check("publicSignals[2] == nonce", BigInt(ps.nonce) === BigInt(nonce));
  check("publicSignals[3] == tokenId", BigInt(ps.tokenId) === BigInt(tokenId));
  check("publicSignals[4] == currentDate", BigInt(ps.currentDate) === BigInt(currentDate));

  console.log("[2] tamper rejection");
  const tampered = [...publicSignals];
  tampered[3] = "999";
  check("tampered tokenId fails verification", !(await zkp.verifyProof(proof, tampered)));

  console.log("[3] underage witness rejection");
  let minorFail = false;
  try {
    const minor = String(zkp.todayYYYYMMDD() - 100000);
    await snarkjs.groth16.fullProve({ ...input, birthdate: minor }, WASM, ZKEY);
  } catch {
    minorFail = true;
  }
  check("underage proof generation fails", minorFail);

  console.log("[4] VP signature");
  const wallet = ethers.Wallet.createRandom();
  const vp = {
    holder: wallet.address,
    did: "did:qrush:t",
    issuer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    vcHash,
    claims: { name: "x", age: 23 }
  };
  const signature = await wallet.signMessage(JSON.stringify(vp));
  check("signature recovers holder", ethers.verifyMessage(JSON.stringify(vp), signature) === wallet.address);

  console.log("[5] mock chain");
  const bc = require("../src/services/blockchain");
  await bc.registerVC(vcHash);
  check("registerVC -> isValidVC true", await bc.isValidVC(vcHash));
  const minted = await bc.mintTicketNFT("0xabc", "1", "1");
  await bc.registerNonce(nonce);
  await bc.useTicketNFT(minted.tokenId, nonce, vcHash, currentDate, proof);
  let reuse = false;
  try {
    await bc.useTicketNFT(minted.tokenId, nonce, vcHash, currentDate, proof);
  } catch {
    reuse = true;
  }
  check("same nonce reuse fails", reuse);

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
