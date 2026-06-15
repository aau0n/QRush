process.env.MOCK_BLOCKCHAIN = "true";
const path = require("path");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");
const { poseidon2 } = require("poseidon-lite");
const zkp = require("../src/services/zkp");

const WASM = path.join(__dirname, "../circuits/build/ticket_verify_js/ticket_verify.wasm");
const ZKEY = path.join(__dirname, "../circuits/build/ticket_verify_final.zkey");

let pass = 0, fail = 0;
const check = (n, c) => { c ? (pass++, console.log("  OK", n)) : (fail++, console.log("  FAIL", n)); };

async function main() {
  console.log("[1] proof generation (self-auth, adult)");
  const nonce = BigInt("0x" + crypto.randomBytes(16).toString("hex")).toString();
  const tokenId = "1", birthdate = "20030415";
  const vcSecret = BigInt("0x" + crypto.randomBytes(15).toString("hex")).toString();
  const vcHash = poseidon2([BigInt(birthdate), BigInt(vcSecret)]).toString();
  const input = { birthdate, vcSecret, vcHash, nonce, tokenId, currentDate: String(zkp.todayYYYYMMDD()) };
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  console.log(`  generated in ${Date.now() - t0}ms, signals=${publicSignals.length}`);

  const ps = zkp.parsePublicSignals(publicSignals);
  check("groth16.verify == true", await zkp.verifyProof(proof, publicSignals));
  check("isAdult == 1", String(ps.isAdult) === "1");
  check("publicSignals[1] == vcHash", ps.vcHash === vcHash);
  check("publicSignals[2] == nonce", BigInt(ps.nonce) === BigInt(nonce));
  check("publicSignals[3] == tokenId", BigInt(ps.tokenId) === BigInt(tokenId));

  console.log("[2] tamper rejection");
  const tampered = [...publicSignals]; tampered[3] = "999";
  check("tampered tokenId fails verification", !(await zkp.verifyProof(proof, tampered)));

  console.log("[3] impersonation: wrong vcSecret -> proof generation fails (★self-auth★)");
  let imp = false;
  try {
    await snarkjs.groth16.fullProve({ ...input, vcSecret: "99999999" }, WASM, ZKEY);
  } catch (e) { imp = true; }
  check("wrong vcSecret cannot forge proof", imp);

  console.log("[4] underage rejection");
  let minorFail = false;
  try {
    const minorBd = String(zkp.todayYYYYMMDD() - 100000);
    const minorHash = poseidon2([BigInt(minorBd), BigInt(vcSecret)]).toString();
    await snarkjs.groth16.fullProve({ ...input, birthdate: minorBd, vcHash: minorHash }, WASM, ZKEY);
  } catch (e) { minorFail = true; }
  check("underage proof generation fails", minorFail);

  console.log("[5] VP signature");
  const w = ethers.Wallet.createRandom();
  const vp = { holder: w.address, did: "did:qrush:t", issuer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", vcHash, claims: { name: "x", age: 23 } };
  const sig = await w.signMessage(JSON.stringify(vp));
  check("signature recovers holder", ethers.verifyMessage(JSON.stringify(vp), sig) === w.address);

  console.log("[6] mock chain");
  const bc = require("../src/services/blockchain");
  await bc.registerVC(vcHash);
  check("registerVC -> isValidVC true", await bc.isValidVC(vcHash));
  const m = await bc.mintTicketNFT("0xabc", "1", "1");
  await bc.registerNonce(nonce);
  await bc.useTicketNFT(m.tokenId, nonce, vcHash, input.currentDate, proof);
  let reuse = false;
  try { await bc.useTicketNFT(m.tokenId, nonce, vcHash, input.currentDate, proof); } catch (e) { reuse = true; }
  check("same nonce reuse fails", reuse);

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
